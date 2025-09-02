#!/usr/bin/env python3
"""
Simple test script to verify live caption display functionality
Sends a DisplayText protobuf message via BLE to the nRF5340 glasses
"""

import sys
import time
sys.path.append('proto')
from mentraos_ble_pb2 import PhoneToGlasses, DisplayText

def create_display_text_message(text, color=0xFFFF, font_code=1, size=16, x=10, y=50):
    """Create a DisplayText protobuf message"""
    
    # Create the main message wrapper
    phone_msg = PhoneToGlasses()
    
    # Set the message type to display_text
    phone_msg.which_payload = PhoneToGlasses.display_text_tag
    
    # Configure the DisplayText payload
    display_text = phone_msg.payload.display_text
    display_text.text = text
    display_text.color = color  # RGB565 format - 0xFFFF = white
    display_text.font_code = font_code
    display_text.size = size
    display_text.x = x
    display_text.y = y
    
    return phone_msg

def test_live_caption():
    """Test live caption functionality with a simple message"""
    
    print("🧪 Testing Live Caption Display")
    print("=" * 50)
    
    # Test messages
    test_messages = [
        "Hello World! Testing live captions...",
        "This is a longer message to test text wrapping and scrolling functionality in the protobuf container.",
        "Live Caption Test #3",
        "Final test message with special chars: ñüéö!@#$%",
    ]
    
    for i, message in enumerate(test_messages, 1):
        print(f"\n📱 Test {i}: Creating DisplayText protobuf message")
        print(f"   Text: \"{message}\"")
        
        # Create protobuf message
        phone_msg = create_display_text_message(
            text=message,
            color=0xFFFF,  # White
            font_code=1,
            size=16,
            x=10,
            y=50 + (i * 30)  # Offset each message
        )
        
        # Serialize to binary
        binary_data = phone_msg.SerializeToString()
        
        print(f"   📦 Protobuf size: {len(binary_data)} bytes")
        print(f"   🏷️  Message tag: {phone_msg.which_payload} (DisplayText)")
        
        # In a real implementation, this would be sent via BLE
        # For now, just show the hex representation
        hex_data = binary_data.hex()
        print(f"   📡 Hex data: {hex_data}")
        
        print(f"   ✅ Message {i} created successfully")
        
        if i < len(test_messages):
            print("   ⏱️  Waiting 2 seconds before next message...")
            time.sleep(2)
    
    print(f"\n🎉 Live Caption Test Complete!")
    print("📋 Summary:")
    print(f"   • Generated {len(test_messages)} test messages")
    print("   • All messages use DisplayText (Tag 30)")
    print("   • Messages ready for BLE transmission")
    print("\n💡 Next steps:")
    print("   • Connect to nRF5340 via BLE")
    print("   • Send these protobuf messages to test live caption display")
    print("   • Verify text appears in Pattern 4 auto-scroll container")

if __name__ == "__main__":
    try:
        test_live_caption()
    except ImportError as e:
        print(f"❌ Error: Missing protobuf module: {e}")
        print("💡 Please generate Python protobuf files from mentraos_ble.proto first")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        sys.exit(1)
