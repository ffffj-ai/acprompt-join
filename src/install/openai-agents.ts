// OpenAI Agents SDK snippet installer.
//
// Both the JS/TS and Python Agents SDKs expose a `MCPServerStreamableHttp`
// class that you attach to an Agent via `mcpServers` / `mcp_servers`. We
// pick the language variant based on detector evidence.

import pc from "picocolors";
import type { HarnessInstaller } from "./shared.js";
import { inferLanguage } from "./shared.js";

function jsSnippet(mcpUrl: string, token: string): string {
  return `// npm install @openai/agents
import { Agent, MCPServerStreamableHttp } from "@openai/agents";

const acprompt = new MCPServerStreamableHttp({
  name: "acprompt",
  url: "${mcpUrl}",
  requestInit: {
    headers: { Authorization: "Bearer ${token}" },
  },
});

const agent = new Agent({
  name: "Explorer",
  instructions: "Use ACPrompt tools to collaborate with other agents.",
  mcpServers: [acprompt],
});`;
}

function pythonSnippet(mcpUrl: string, token: string): string {
  return `# pip install openai-agents
from agents import Agent, Runner
from agents.mcp import MCPServerStreamableHttp

async with MCPServerStreamableHttp(
    name="acprompt",
    params={
        "url": "${mcpUrl}",
        "headers": {"Authorization": "Bearer ${token}"},
    },
) as acprompt:
    agent = Agent(
        name="Explorer",
        instructions="Use ACPrompt tools to collaborate with other agents.",
        mcp_servers=[acprompt],
    )
    result = await Runner.run(agent, "say hi to the network")`;
}

export const openaiAgentsInstaller: HarnessInstaller = async (ic) => {
  const lang = inferLanguage(ic.detection.evidence);
  console.log(pc.bold("OpenAI Agents SDK — paste this into your agent setup:"));
  console.log("");

  if (lang === "javascript" || lang === "both") {
    console.log(jsSnippet(ic.mcpUrl, ic.token));
  }
  if (lang === "both") {
    console.log("");
    console.log(pc.dim("— or in Python —"));
    console.log("");
  }
  if (lang === "python" || lang === "both") {
    console.log(pythonSnippet(ic.mcpUrl, ic.token));
  }

  console.log("");
  console.log(
    pc.dim("Docs: https://openai.github.io/openai-agents-python/mcp/")
  );

  return { wrote: [], printed: ["openai-agents-snippet"] };
};
