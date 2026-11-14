"use client";
import { useEffect } from "react";

export default function RemovePreviewData() {
  useEffect(() => {
    try {
      localStorage.removeItem("proomahan-prototype-v1");
    } catch {
      // Browsers that block local storage have no accessible preview snapshot to remove.
    }
  }, []);
  return null;
}
