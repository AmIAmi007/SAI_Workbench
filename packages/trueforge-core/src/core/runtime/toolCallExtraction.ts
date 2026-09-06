import { randomUUID } from 'node:crypto';
import type { RawAssistantMessage, RawToolCall } from '../llm/LLMTypes';
import type { MappedMCPTool } from '../mcp/convertMCPServers';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface ExtractedCall {
  toolName: string;
  argsString: string;
  matchedText: string;
}

function tryParseCandidate(candidateText: string, toolMapping: Map<string, MappedMCPTool>): ExtractedCall[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidateText);
  } catch {
    return [];
  }

  const items = Array.isArray(parsed) ? parsed : [parsed];
  const results: ExtractedCall[] = [];

  for (const item of items) {
    if (!isRecord(item)) {
      continue;
    }

    let toolName: string | undefined;
    if (typeof item['name'] === 'string' && toolMapping.has(item['name'])) {
      toolName = item['name'];
    } else if (typeof item['tool'] === 'string' && toolMapping.has(item['tool'])) {
      toolName = item['tool'];
    } else if (
      isRecord(item['function']) &&
      typeof item['function']['name'] === 'string' &&
      toolMapping.has(item['function']['name'])
    ) {
      toolName = item['function']['name'];
    }

    if (toolName === undefined) {
      continue;
    }

    const rawArgs =
      item['arguments'] ??
      item['parameters'] ??
      item['input'] ??
      (isRecord(item['function']) ? item['function']['arguments'] : undefined);

    let argsString: string;
    if (typeof rawArgs === 'string') {
      argsString = rawArgs;
    } else if (isRecord(rawArgs) || Array.isArray(rawArgs)) {
      argsString = JSON.stringify(rawArgs);
    } else {
      const { name, tool, function: fn, ...rest } = item;
      void name;
      void tool;
      void fn;
      argsString = Object.keys(rest).length > 0 ? JSON.stringify(rest) : '{}';
    }

    results.push({
      toolName,
      argsString,
      matchedText: candidateText,
    });
  }

  return results;
}

/** Finds balanced curly-brace JSON objects starting with "name" or "tool". */
function findRawJsonObjects(text: string): string[] {
  const matches: string[] = [];
  const startPattern = /\{\s*"(?:name|tool)"\s*:/g;
  let match: RegExpExecArray | null = startPattern.exec(text);

  while (match !== null) {
    const startIndex = match.index;
    let depth = 0;
    let inString = false;
    let escape = false;
    let endIndex = -1;

    for (let i = startIndex; i < text.length; i++) {
      const ch = text[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (ch === '{') {
          depth++;
        } else if (ch === '}') {
          depth--;
          if (depth === 0) {
            endIndex = i + 1;
            break;
          }
        }
      }
    }

    if (endIndex > startIndex) {
      matches.push(text.slice(startIndex, endIndex));
      startPattern.lastIndex = endIndex;
    }

    match = startPattern.exec(text);
  }

  return matches;
}

/**
 * Recovers tool calls from assistant message content when an LLM outputs tool invocations
 * as a markdown JSON block or raw JSON object in chat text instead of native tool_calls.
 */
export function extractToolCallsFromAssistantMessage({
  assistantMessage,
  toolMapping,
}: {
  assistantMessage: RawAssistantMessage;
  toolMapping: Map<string, MappedMCPTool>;
}): RawAssistantMessage {
  if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
    return assistantMessage;
  }

  const rawContent = assistantMessage.content;
  if (typeof rawContent !== 'string' || rawContent.trim().length === 0) {
    return assistantMessage;
  }

  const extracted: ExtractedCall[] = [];
  const textToRemove: string[] = [];

  // 1. Scan for fenced code blocks (```json ... ``` or ```tool_call ... ``` or ``` ... ```)
  const codeBlockRegex = /```(?:json|tool_call)?\s*([\s\S]*?)\s*```/g;
  let blockMatch: RegExpExecArray | null = codeBlockRegex.exec(rawContent);

  while (blockMatch !== null) {
    const innerText = blockMatch[1];
    const fullBlock = blockMatch[0];
    if (innerText) {
      const calls = tryParseCandidate(innerText.trim(), toolMapping);
      if (calls.length > 0) {
        extracted.push(...calls);
        textToRemove.push(fullBlock);
      }
    }
    blockMatch = codeBlockRegex.exec(rawContent);
  }

  // 2. If no code blocks matched, scan for raw JSON objects in text
  if (extracted.length === 0) {
    const jsonCandidates = findRawJsonObjects(rawContent);
    for (const candidate of jsonCandidates) {
      const calls = tryParseCandidate(candidate.trim(), toolMapping);
      if (calls.length > 0) {
        extracted.push(...calls);
        textToRemove.push(candidate);
      }
    }
  }

  if (extracted.length === 0) {
    return assistantMessage;
  }

  let cleanedContent = rawContent;
  for (const block of textToRemove) {
    cleanedContent = cleanedContent.replace(block, '');
  }

  const trimmed = cleanedContent.trim();
  const finalContent = trimmed.length > 0 ? trimmed : null;

  const tool_calls: RawToolCall[] = extracted.map(call => ({
    id: `call_${randomUUID().replace(/-/g, '').slice(0, 9)}`,
    type: 'function',
    function: {
      name: call.toolName,
      arguments: call.argsString,
    },
  }));

  return {
    ...assistantMessage,
    content: finalContent,
    tool_calls,
  };
}
