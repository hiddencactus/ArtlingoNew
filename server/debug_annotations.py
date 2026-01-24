#!/usr/bin/env python3
"""
Debug script to check what annotation files exist and their contents
"""

import os
import json
from pathlib import Path

annotations_dir = r"d:\MacAI\ArtlingoNew\server\data\annotations"

print("=" * 60)
print("CHECKING ANNOTATION FILES")
print("=" * 60)

if not os.path.exists(annotations_dir):
    print(f"❌ Annotations folder not found: {annotations_dir}")
    exit(1)

files = os.listdir(annotations_dir)
print(f"\n📁 Files in {annotations_dir}:")
for f in files:
    print(f"  - {f}")

print("\n" + "=" * 60)
print("FILE CONTENTS")
print("=" * 60)

for filename in files:
    filepath = os.path.join(annotations_dir, filename)
    print(f"\n📄 {filename}:")
    print("-" * 60)
    
    try:
        with open(filepath, 'r') as f:
            content = f.read().strip()
            if not content:
                print("  (empty file)")
            else:
                data = json.loads(content)
                # Show which image and which artists
                if isinstance(data, list):
                    print(f"  Total annotations: {len(data)}")
                    for i, ann in enumerate(data):
                        img_id = ann.get("image_id", "?")
                        artist_id = ann.get("artist_id", "?")
                        timestamp = ann.get("timestamp", "?")
                        print(f"    [{i+1}] Image: {img_id}, Artist: {artist_id}, Time: {timestamp}")
                else:
                    print(f"  Unexpected format: {type(data)}")
    except json.JSONDecodeError as e:
        print(f"  ❌ JSON error: {e}")
    except Exception as e:
        print(f"  ❌ Error: {e}")

print("\n" + "=" * 60)
print("SUMMARY")
print("=" * 60)
print("""
How annotations are stored:
- Each IMAGE has ONE file: annotations_{image_id}.json
- Example: annotations_1.jpeg.json stores ALL annotations for image 1.jpeg
- This file contains a LIST of annotation objects, one per artist

So:
- annotations_1.jpeg.json = all annotations for image 1
- annotations_2.webp.json = all annotations for image 2

If image 2 shows "Already Annotated" but you only labeled image 1:
→ annotations_2.webp.json should be EMPTY or NOT EXIST
→ If it has Stephen's data, something is wrong with the file naming
""")
