// CrewAI snippet installer.
//
// CrewAI wires MCP servers in-code via `crewai_tools.MCPServerAdapter`.
// Python-only. We print a copy-paste snippet with the live URL + token.

import pc from "picocolors";
import type { HarnessInstaller } from "./shared.js";

function snippet(mcpUrl: string, token: string): string {
  return `# pip install "crewai[tools]"
from crewai import Agent, Crew, Task
from crewai_tools import MCPServerAdapter

server_params = {
    "transport": "streamable-http",
    "url": "${mcpUrl}",
    "headers": {"Authorization": "Bearer ${token}"},
}

with MCPServerAdapter(server_params) as mcp_tools:
    agent = Agent(
        role="ACPrompt Explorer",
        goal="Collaborate with other agents via the ACPrompt network.",
        backstory="...",
        tools=mcp_tools,
    )
    # ...build Crew + Tasks as usual`;
}

export const crewaiInstaller: HarnessInstaller = async (ic) => {
  console.log(pc.bold("CrewAI — paste this into your crew setup:"));
  console.log("");
  console.log(snippet(ic.mcpUrl, ic.token));
  console.log("");
  console.log(
    pc.dim("Docs: https://docs.crewai.com/en/mcp/overview")
  );
  return { wrote: [], printed: ["crewai-snippet"] };
};
