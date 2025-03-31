import { Agent } from "./AgentInterface";
import { PromptTemplate } from "@langchain/core/prompts";
import { LLMProvider } from "@augmentos/utils";
import { AgentExecutor, createReactAgent } from "langchain/agents";

interface AgentOutput {
  insight: string;
}

const outputExamples = `1. Context: "Tell me something interesting about space"
    Final Answer: {{"insight": "A day on Venus is longer than its year"}}
  2. Context: "What's a cool fact about animals?"
    Final Answer: {{"insight": "Octopuses have three hearts and blue blood"}}
  3. Context: "Share something fascinating about history"
    Final Answer: {{"insight": "The Great Wall of China is not visible from space"}}`;

const agentPromptBlueprint = `You are an AI assistant specialized in providing fascinating and engaging fun facts. Your goal is to share interesting, surprising, and educational information that captivates the audience.

When generating fun facts, follow these rules:
1. Focus on facts that are surprising, counterintuitive, or particularly interesting
2. Keep facts concise (under 15 words)
3. Ensure facts are verifiable and accurate
4. Avoid controversial or sensitive topics
5. When you have a fun fact to share, output your final answer on a new line prefixed by "Final Answer:" followed immediately by a JSON object exactly like:
   Final Answer: {{"insight": "<fun fact>"}}
6. For context, today's date is ${new Date().toLocaleDateString()}

**Do not output any other text.**

${outputExamples}

Remember that you are creating engaging, educational content that should spark curiosity and interest.`;

export class FunFactAgent implements Agent {
  public agentId = 'fun_fact';
  public agentName = 'Fun Fact Generator';
  public agentDescription = 'Generates interesting and engaging fun facts on various topics. Call this agent when you want to share surprising, educational, or fascinating information. Best for adding engaging content to conversations or presentations.';
  public agentExamples = outputExamples;
  public agentPrompt = agentPromptBlueprint;
  public agentTools = [];

  public parseOutput(text: string): AgentOutput {
    const finalMarker = "Final Answer:";
    if (text.includes(finalMarker)) {
      text = text.split(finalMarker)[1].trim();
    }
    try {
      const parsed = JSON.parse(text);
      // If the object has an "insight" key, return it.
      if (typeof parsed.insight === "string") {
        return { insight: parsed.insight };
      }
    } catch (e) {
      // Fallback attempt to extract an "insight" value from a string
      const match = text.match(/"insight"\s*:\s*"([^"]+)"/);
      if (match) {
        return { insight: match[1] };
      }
    }
    return { insight: "null" };
  }

  public async handleContext(userContext: Record<string, any>): Promise<any> {
    try {
      const llm = LLMProvider.getLLM();
      const prompt = new PromptTemplate({
        template: this.agentPrompt,
        inputVariables: [],
      });

      const agent = await createReactAgent({
        llm,
        tools: this.agentTools,
        prompt,
      });

      const executor = new AgentExecutor({
        agent,
        tools: this.agentTools,
        maxIterations: 1,
        verbose: false,
      });

      const result = await executor.invoke({});

      const parsedResult = this.parseOutput(result.output);
      return parsedResult;
    } catch (err) {
      console.error('[FunFactAgent] Error:', err);
      return { insight: "null" };
    }
  }
}
