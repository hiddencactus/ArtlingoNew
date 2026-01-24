/**
 * ARTIST SELECTION MODAL
 * 
 * First screen user sees. Choose from 4 preset artists.
 * Artist choice is saved to localStorage for persistence.
 */

import React from "react";
import { ARTISTS } from "../utils/constants";

export default function ArtistModal({ onSelectArtist }) {
  return (
    <div className="flex items-center justify-center min-h-screen bg-black">
      <div className="bg-gray-900 p-10 rounded-lg border-2 border-blue-500 max-w-md">
        <h2 className="text-2xl font-bold text-white mb-6">👤 Artist Identification</h2>
        <p className="text-gray-300 mb-6">Select your name to track your annotations:</p>
        
        <div className="space-y-3">
          {ARTISTS.map((name) => (
            <button
              key={name}
              onClick={() => onSelectArtist(name)}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition font-bold"
            >
              {name}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
