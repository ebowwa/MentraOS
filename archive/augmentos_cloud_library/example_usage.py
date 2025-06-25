import asyncio
from augmentos_client import AppClient

class ExampleApp:
    def __init__(self):
        self.client = AppClient(
            app_id="com.exampletpa.example",
            app_name="ExampleApp",
            app_description="An example app for AugmentOS",
            server_url="http://localhost:8080",
            subscriptions=["*"]
        )
        # Register callbacks
        self.client.on_transcript_received(self.on_transcript)
        self.client.on_location_received(self.on_location)
        self.client.on_camera_received(self.on_camera)
        self.client.on_other_received(self.on_other)

    async def on_transcript(self, data):
        print(f"[ExampleApp on_transcript] Data received in callback: {data}")
        transcript_text = data['data']['text']
        await self.client.send_reference_card(data['user_id'], "ExampleTitle", transcript_text)

    async def on_location(self, data):
        print(f"[ExampleApp on_location] Data received in callback: {data}")

    async def on_camera(self, data):
        print(f"[ExampleApp on_camera] Data received in callback: {data}")

    async def on_other(self, data):
        print(f"[ExampleApp on_other] Data received in callback: {data}")

    def start(self):
        # Start the FastAPI server in a separate thread
        self.client.start()

async def main():
    example_app = ExampleApp()
    example_app.start()
    # Run indefinitely to keep the FastAPI app running
    while True:
        await asyncio.sleep(3600)

if __name__ == "__main__":
    asyncio.run(main())
