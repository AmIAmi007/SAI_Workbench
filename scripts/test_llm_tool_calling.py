#!/usr/bin/env python3
import json
import os
import sys
import urllib.request
import urllib.error

# Read base URL from env or argument
base_url = sys.argv[1] if len(sys.argv) > 1 else os.getenv("LOCAL_LLM_BASE_URL", "http://127.0.0.1:11434/v1")
model = sys.argv[2] if len(sys.argv) > 2 else "qwen2.5-coder:7b"

url = f"{base_url.rstrip('/')}/chat/completions"

tools = [
    {
        "type": "function",
        "function": {
            "name": "execute_engineering_calc",
            "description": "Executes fluid mechanics, pressure drop, velocity, or pump hydraulics calculations.",
            "parameters": {
                "type": "object",
                "properties": {
                    "calc_type": {
                        "type": "string",
                        "enum": ["pressure_drop", "flow_velocity", "pump_head"],
                        "description": "Type of calculation to perform"
                    },
                    "parameters": {
                        "type": "object",
                        "description": "Calculation input parameters"
                    }
                },
                "required": ["calc_type", "parameters"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "generate_sai_approval_note",
            "description": "Generates an official Management of Change (MOC) note and persists to disk.",
            "parameters": {
                "type": "object",
                "properties": {
                    "unit_id": {"type": "string"},
                    "moc_type": {"type": "string"},
                    "justification": {"type": "string"},
                    "risk_level": {"type": "string", "enum": ["LOW", "MEDIUM", "HIGH", "CRITICAL"]},
                    "file_format": {"type": "string", "enum": ["docx", "pdf", "txt"], "default": "docx"}
                },
                "required": ["unit_id", "moc_type", "justification"]
            }
        }
    }
]

payload = {
    "model": model,
    "messages": [
        {
            "role": "system",
            "content": (
                "You are SAI (Sovereign Agentic Infrastructure), an air-gapped refinery copilot.\n"
                "CRITICAL OPERATIONAL RULES:\n"
                "- NEVER calculate fluid mechanics, velocity, or pressure drops using mental arithmetic. Always invoke `execute_engineering_calc`.\n"
                "- NEVER output raw JSON tool mockups or strings like `{\"name\": ...}` in chat text. Invoke tools natively via API tool calls.\n"
                "- When an operational issue is described, sequentially call `execute_engineering_calc` first, then call `generate_sai_approval_note` with the calculated results."
            )
        },
        {
            "role": "user",
            "content": "Line L-1042 crude flow rate is 450 m3/h in a 10 inch pipe. Calculate the flow velocity to check for erosion velocity limits."
        }
    ],
    "tools": tools,
    "tool_choice": "auto"
}

print(f"Testing endpoint: {url} with model: {model} and tool_choice: auto...")
req = urllib.request.Request(
    url,
    data=json.dumps(payload).encode("utf-8"),
    headers={"Content-Type": "application/json"},
    method="POST"
)

try:
    with urllib.request.urlopen(req, timeout=15) as resp:
        body = resp.read().decode("utf-8")
        data = json.loads(body)
        print("\n--- Response Status ---")
        print(f"HTTP {resp.status}")
        choices = data.get("choices", [])
        if choices:
            choice = choices[0]
            message = choice.get("message", {})
            tool_calls = message.get("tool_calls", [])
            content = message.get("content", "")
            
            print("\n--- Message Content ---")
            print(content or "(No text content)")
            
            print("\n--- Tool Calls ---")
            if tool_calls:
                print(f"Detected {len(tool_calls)} native tool call(s):")
                for i, tc in enumerate(tool_calls, 1):
                    fn = tc.get("function", {})
                    print(f"  [{i}] ID: {tc.get('id')}")
                    print(f"      Function: {fn.get('name')}")
                    print(f"      Arguments: {fn.get('arguments')}")
                if any(tc.get("function", {}).get("name") == "execute_engineering_calc" for tc in tool_calls):
                    print("\nSUCCESS: Model correctly targeted execute_engineering_calc natively via tool_calls!")
                else:
                    print("\nWARNING: tool_calls present but execute_engineering_calc was not targeted.")
            else:
                print("FAILURE: No native tool_calls returned in message object.")
                print(f"Raw Choice: {json.dumps(choice, indent=2)}")
        else:
            print("FAILURE: No choices returned.")
            print(f"Raw Body: {body}")
except urllib.error.HTTPError as e:
    err_body = e.read().decode("utf-8", errors="replace")
    print(f"\nHTTP Error {e.code}: {err_body}")
except Exception as e:
    print(f"\nConnection failed to {url}: {e}")
