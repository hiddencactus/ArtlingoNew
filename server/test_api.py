#!/usr/bin/env python3
"""
Quick test script to verify API endpoints are working
"""

import requests
import json

BASE_URL = "http://localhost:5000"

print("=" * 60)
print("TESTING ARTLINGO API")
print("=" * 60)

# Test 1: Get image list
print("\n1️⃣  Testing GET /api/images")
print("-" * 60)
try:
    res = requests.get(f"{BASE_URL}/api/images")
    print(f"Status: {res.status_code}")
    data = res.json()
    print(f"Response: {json.dumps(data, indent=2)}")
except Exception as e:
    print(f"❌ Error: {e}")

# Test 2: Submit annotation
print("\n2️⃣  Testing POST /api/label")
print("-" * 60)
try:
    payload = {
        "image_id": "1.jpeg",
        "artist_id": "stephen",
        "clicks": [[256, 256], [320, 192], [224, 320]]
    }
    print(f"Payload: {json.dumps(payload, indent=2)}")
    
    res = requests.post(
        f"{BASE_URL}/api/label",
        json=payload,
        headers={"Content-Type": "application/json"}
    )
    print(f"Status: {res.status_code}")
    data = res.json()
    
    print(f"Keys in response: {list(data.keys())}")
    print(f"Has 'patches'? {'patches' in data}")
    if 'patches' in data:
        print(f"Number of patches: {len(data['patches'])}")
        print(f"First patch: {json.dumps(data['patches'][0], indent=2)}")
    print(f"Progress: {data.get('message', 'N/A')}")
    
except Exception as e:
    print(f"❌ Error: {e}")

# Test 3: Get annotations
print("\n3️⃣  Testing GET /api/labels/<image_id>")
print("-" * 60)
try:
    res = requests.get(f"{BASE_URL}/api/labels/1.jpeg")
    print(f"Status: {res.status_code}")
    data = res.json()
    print(f"Annotation count: {data.get('annotation_count', 0)}")
    print(f"Artists: {data.get('artists', [])}")
except Exception as e:
    print(f"❌ Error: {e}")

print("\n" + "=" * 60)
print("TESTS COMPLETE")
print("=" * 60)
