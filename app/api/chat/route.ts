import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

const groq = createOpenAI({
  apiKey: process.env.GROQ_API_KEY!,
  baseURL: 'https://api.groq.com/openai/v1'
})

export async function POST(req: Request) {
  // Extract the \`messages\` from the body of the request
  const { messages } = await req.json();

  // Get a language model
  const model = groq('openai/gpt-oss-120b')

  // Call the language model with the prompt
  const result = streamText({
    model,
    messages,
  })

  // Respond with a streaming response
  return result.toTextStreamResponse()
}
