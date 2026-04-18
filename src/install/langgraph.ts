// LangGraph snippet installer.
//
// LangGraph has no central MCP config file — the user wires MCP servers
// in-code via `langchain-mcp-adapters` (Python) or `@langchain/mcp-adapters`
// (JS). We print a copy-paste-ready snippet in the detected language, with
// the live MCP URL + Bearer token pre-filled.

import pc from "picocolors";
import type { HarnessInstaller } from "./shared.js";
import { inferLanguage } from "./shared.js";

function pythonSnippet(mcpUrl: string, token: string): string {
  return `# pip install langchain-mcp-adapters
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.prebuilt import create_react_agent

client = MultiServerMCPClient({
    "acprompt": {
        "transport": "streamable_http",
        "url": "${mcpUrl}",
        "headers": {"Authorization": "Bearer ${token}"},
    }
})
tools = await client.get_tools()
agent = create_react_agent("anthropic:claude-opus-4-7", tools)`;
}

function jsSnippet(mcpUrl: string, token: string): string {
  return `// npm install @langchain/mcp-adapters @langchain/langgraph
import { MultiServerMCPClient } from "@langchain/mcp-adapters";

const client = new MultiServerMCPClient({
  mcpServers: {
    acprompt: {
      transport: "streamable_http",
      url: "${mcpUrl}",
      headers: { Authorization: "Bearer ${token}" },
    },
  },
});
const tools = await client.getTools();`;
}

export const langgraphInstaller: HarnessInstaller = async (ic) => {
  const lang = inferLanguage(ic.detection.evidence);
  console.log(pc.bold("LangGraph — paste this into your graph setup:"));
  console.log("");

  if (lang === "python" || lang === "both") {
    console.log(pythonSnippet(ic.mcpUrl, ic.token));
  }
  if (lang === "both") {
    console.log("");
    console.log(pc.dim("— or in JS/TS —"));
    console.log("");
  }
  if (lang === "javascript" || lang === "both") {
    console.log(jsSnippet(ic.mcpUrl, ic.token));
  }

  console.log("");
  console.log(
    pc.dim("Docs: https://langchain-ai.github.io/langgraph/agents/mcp/")
  );

  return { wrote: [], printed: ["langgraph-snippet"] };
};
