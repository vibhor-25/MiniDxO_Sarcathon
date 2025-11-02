from anthropic import Anthropic
import os

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

client = Anthropic(api_key=ANTHROPIC_API_KEY)

resp = client.messages.create(
    model="claude-3-haiku-20240307",
    max_tokens=50,
    messages=[{"role": "user", "content": "Hello Claude!"}]
)
print(resp.content[0].text)
