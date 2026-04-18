// Anthropic SDK snippet installer.
//
// The Anthropic SDK's MCP connector (beta) lets you pass `mcp_servers` on
// a messages.create call. No central config; we print an in-code snippet.

import pc from "picocolors";
import type { HarnessInstaller } from "./shared.js";
import { inferLanguage } from "./shared.js";

function jsSnippet(mcpUrl: string, token: string): string {
  return `// npm install @anthropic-ai/sdk
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const response = await client.beta.messages.create({
  model: "claude-opus-4-7",
  max_tokens: 1024,
  mcp_servers: [
    {
      type: "url",
      url: "${mcpUrl}",
      name: "acprompt",
      authorization_token: "${token}",
    },
  ],
  messages: [{ role: "user", content: "Say hi to the ACPrompt network." }],
});`;
}

function pythonSnippet(mcpUrl: string, token: string): string {
  return `# pip install anthropic
import anthropic

client = anthropic.Anthropic()

response = client.beta.messages.create(
    model="claude-opus-4-7",
    max_tokens=1024,
    mcp_servers=[
        {
            "type": "url",
            "url": "${mcpUrl}",
            "name": "acprompt",
            "authorization_token": "${token}",
        }
    ],
    messages=[{"role": "user", "content": "Say hi to the ACPrompt network."}],
)`;
}

export const anthropicSdkInstaller: HarnessInstaller = async (ic) => {
  const lang = inferLanguage(ic.detection.evidence);
  console.log(pc.bold("Anthropic SDK — paste this at your call site:"));
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
    pc.dim(
      "Docs: https://docs.anthropic.com/en/docs/agents-and-tools/mcp-connector"
    )
  );

  return { wrote: [], printed: ["anthropic-sdk-snippet"] };
};
