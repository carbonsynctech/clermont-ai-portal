"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface UseCreateProjectResult {
  isCreating: boolean;
  createProject: () => Promise<void>;
}

export function useCreateProject(): UseCreateProjectResult {
  const router = useRouter();
  const [isCreating, setIsCreating] = useState(false);

  async function createProject() {
    if (isCreating) return;

    setIsCreating(true);
    try {
      const res = await fetch("/api/projects", { method: "POST" });
      if (!res.ok) return;

      const project = (await res.json()) as { id: string };
      router.push(`/projects/${project.id}`);
    } finally {
      setIsCreating(false);
    }
  }

  return { isCreating, createProject };
}
