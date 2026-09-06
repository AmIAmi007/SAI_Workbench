import type { RawAssistantMessage } from '../../../src/core/llm/LLMTypes';
import type { MappedMCPTool } from '../../../src/core/mcp/convertMCPServers';
import { extractToolCallsFromAssistantMessage } from '../../../src/core/runtime/toolCallExtraction';

function createMockToolMapping(toolNames: string[]): Map<string, MappedMCPTool> {
  const map = new Map<string, MappedMCPTool>();
  for (const name of toolNames) {
    map.set(name, {
      toolSet: {
        id: 'test-server',
        name: 'test-server',
        description: 'test description',
        preload: true,
        hasPreloadedTools: true,
        listTools: async () => ({
          result: { tools: [] },
          wasInitialized: undefined,
        }),
        callTool: async () => ({
          result: { content: [] },
          wasInitialized: undefined,
        }),
        toolCallInfo: async () => ({
          type: 'mcp' as const,
          mcp_server_id: 'test-server',
          mcp_server_name: 'test-server',
          original_tool_name: name,
        }),
      },
      originalToolName: name,
    });
  }
  return map;
}

describe('extractToolCallsFromAssistantMessage', () => {
  const toolMapping = createMockToolMapping(['execute_engineering_calc', 'generate_sai_approval_note']);

  it('preserves messages that already have native tool_calls', () => {
    const message: RawAssistantMessage = {
      role: 'assistant',
      content: 'Here is the result',
      tool_calls: [
        {
          id: 'call_123',
          type: 'function',
          function: {
            name: 'execute_engineering_calc',
            arguments: '{"calc_type":"flow_velocity"}',
          },
        },
      ],
    };

    const result = extractToolCallsFromAssistantMessage({ assistantMessage: message, toolMapping });
    expect(result).toBe(message);
    expect(result.tool_calls).toHaveLength(1);
    expect(result.tool_calls?.[0]?.id).toBe('call_123');
  });

  it('extracts tool call from fenced markdown json block', () => {
    const rawContent = `\`\`\`json
{
  "name": "execute_engineering_calc",
  "arguments": {
    "calc_type": "flow_velocity",
    "parameters": {
      "flow_rate_m3h": 450,
      "pipe_inner_diameter_mm": 254
    }
  }
}
\`\`\``;

    const message: RawAssistantMessage = {
      role: 'assistant',
      content: rawContent,
    };

    const result = extractToolCallsFromAssistantMessage({ assistantMessage: message, toolMapping });
    expect(result.tool_calls).toHaveLength(1);
    const tc = result.tool_calls?.[0];
    expect(tc?.function.name).toBe('execute_engineering_calc');
    expect(JSON.parse(tc?.function.arguments ?? '{}')).toEqual({
      calc_type: 'flow_velocity',
      parameters: {
        flow_rate_m3h: 450,
        pipe_inner_diameter_mm: 254,
      },
    });
    expect(result.content).toBeNull();
  });

  it('preserves text preamble before the tool call markdown block', () => {
    const rawContent = `I will calculate the crude flow velocity for Line L-1042.

\`\`\`json
{
  "name": "execute_engineering_calc",
  "arguments": {
    "calc_type": "flow_velocity",
    "parameters": { "flow_rate": 450 }
  }
}
\`\`\``;

    const message: RawAssistantMessage = {
      role: 'assistant',
      content: rawContent,
    };

    const result = extractToolCallsFromAssistantMessage({ assistantMessage: message, toolMapping });
    expect(result.tool_calls).toHaveLength(1);
    expect(result.content).toBe('I will calculate the crude flow velocity for Line L-1042.');
  });

  it('handles parameters field instead of arguments', () => {
    const rawContent = `\`\`\`json
{
  "name": "execute_engineering_calc",
  "parameters": {
    "calc_type": "pressure_drop",
    "fluid": "crude_oil"
  }
}
\`\`\``;

    const message: RawAssistantMessage = {
      role: 'assistant',
      content: rawContent,
    };

    const result = extractToolCallsFromAssistantMessage({ assistantMessage: message, toolMapping });
    expect(result.tool_calls).toHaveLength(1);
    const tc = result.tool_calls?.[0];
    expect(tc?.function.name).toBe('execute_engineering_calc');
    expect(JSON.parse(tc?.function.arguments ?? '{}')).toEqual({
      calc_type: 'pressure_drop',
      fluid: 'crude_oil',
    });
  });

  it('extracts raw JSON without code fences if tool matches', () => {
    const rawContent = `Executing calculation now:
{
  "name": "generate_sai_approval_note",
  "arguments": {
    "unit_id": "CDU-01",
    "moc_type": "Setpoint Override",
    "justification": "Overhead temp high"
  }
}`;

    const message: RawAssistantMessage = {
      role: 'assistant',
      content: rawContent,
    };

    const result = extractToolCallsFromAssistantMessage({ assistantMessage: message, toolMapping });
    expect(result.tool_calls).toHaveLength(1);
    const tc = result.tool_calls?.[0];
    expect(tc?.function.name).toBe('generate_sai_approval_note');
    expect(result.content).toBe('Executing calculation now:');
  });

  it('ignores json blocks for unknown tools', () => {
    const rawContent = `\`\`\`json
{
  "name": "some_unknown_function",
  "arguments": { "foo": "bar" }
}
\`\`\``;

    const message: RawAssistantMessage = {
      role: 'assistant',
      content: rawContent,
    };

    const result = extractToolCallsFromAssistantMessage({ assistantMessage: message, toolMapping });
    expect(result.tool_calls).toBeUndefined();
    expect(result.content).toBe(rawContent);
  });
});
