#!/usr/bin/env python3
"""
Test the API endpoints to see what they're returning
"""

import requests
import json

BASE_URL = "http://localhost:5000"

print("=" * 60)
print("TESTING ANNOTATION CHECK ENDPOINTS")
print("=" * 60)

images = ["1.jpeg", "2.webp"]

for image_id in images:
    print(f"\n📸 Checking: {image_id}")
    print("-" * 60)
    try:
        url = f"{BASE_URL}/api/labels/{image_id}"
        print(f"GET {url}")
        res = requests.get(url)
        print(f"Status: {res.status_code}")
        
        if res.status_code == 200:
            data = res.json()
            artists = data.get("artists", [])
            print(f"Artists who annotated: {artists}")
            print(f"Total annotations: {len(artists)}")
        elif res.status_code == 404:
            print("No annotations found (404)")
        else:
            print(f"Error: {res.status_code}")
            print(res.text)
    except Exception as e:
        print(f"Error: {e}")

print("\n" + "=" * 60)
print("EXPLANATION")
print("=" * 60)
print("""
For each image:
- 1.jpeg should show: Artists who annotated = ['Stephen']
- 2.webp should show: Artists who annotated = [] (empty, not annotated yet)

If 2.webp incorrectly shows ['Stephen'], then:
→ Either the backend is loading the wrong file
→ Or the file naming is wrong
→ Or both files got mixed up
""")
