"""
==============================================================================
ANNOTATION STORAGE MODULE
==============================================================================
Handles reading/writing JSON annotation files.
==============================================================================
"""

import os
import json

ANNOTATIONS_DIR = 'data/annotations'

# Create annotations directory if it doesn't exist
os.makedirs(ANNOTATIONS_DIR, exist_ok=True)


def get_annotations_file(image_id):
    """
    Get the file path for annotations of an image.
    
    Args:
      image_id (str): Image filename (e.g., "1.jpeg")
    
    Returns:
      str: Full path to JSON file
    """
    filename = f"annotations_{image_id.replace('.', '_')}.json"
    return os.path.join(ANNOTATIONS_DIR, filename)


def load_annotations(image_id):
    """
    Load all annotations for an image from JSON file.
    
    Args:
      image_id (str): Image filename
    
    Returns:
      list: List of annotation dicts, or [] if file doesn't exist
    """
    filepath = get_annotations_file(image_id)
    
    if not os.path.exists(filepath):
        return []
    
    try:
        with open(filepath, 'r') as f:
            content = f.read().strip()
            # Handle empty files
            if not content:
                return []
            return json.loads(content)
    except json.JSONDecodeError:
        # If file is corrupted, return empty list
        print(f"⚠️ Warning: Corrupted JSON in {filepath}, returning empty list")
        return []


def save_annotation(image_id, annotation_dict):
    """
    Save a new annotation to the JSON file.
    Appends to existing annotations if file exists.
    
    Args:
      image_id (str): Image filename
      annotation_dict (dict): The annotation to save
    
    Returns:
      int: Total number of annotations for this image
    """
    filepath = get_annotations_file(image_id)
    
    # Load existing annotations
    annotations = load_annotations(image_id)
    
    # Append new annotation
    annotations.append(annotation_dict)
    
    # Write back to file
    with open(filepath, 'w') as f:
        json.dump(annotations, f, indent=2)
    
    return len(annotations)


def save_training_data(image_id, training_data):
    """
    Save consensus training data for an image.
    
    Args:
      image_id (str): Image filename
      training_data (dict): Consensus data to save
    
    Returns:
      str: Path to training file
    """
    filename = f"training_{image_id.replace('.', '_')}.json"
    filepath = os.path.join(ANNOTATIONS_DIR, filename)
    
    with open(filepath, 'w') as f:
        json.dump(training_data, f, indent=2)
    
    return filepath


def has_training_data(image_id):
    """Check if training data exists for an image."""
    filename = f"training_{image_id.replace('.', '_')}.json"
    filepath = os.path.join(ANNOTATIONS_DIR, filename)
    return os.path.exists(filepath)
