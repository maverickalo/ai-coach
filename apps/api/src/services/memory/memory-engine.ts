import { and, desc, eq } from "drizzle-orm";
import type { Database } from "../../db/index.js";
import { memories } from "../../db/schema.js";
import type { Memory } from "../../types/domain.js";

export interface MemoryInput {
  category: string;
  key: string;
  value: string;
  confidence: number;
  source: string;
}

export class MemoryEngine {
  constructor(private readonly db: Database) {}

  async getRelevantMemories(userId: string, limit = 20): Promise<Memory[]> {
    const rows = await this.db
      .select()
      .from(memories)
      .where(eq(memories.userId, userId))
      .orderBy(desc(memories.confidence), desc(memories.updatedAt))
      .limit(limit);

    return rows.map((row) => ({
      id: row.id,
      key: row.key,
      value: row.value,
      category: row.category,
      confidence: Number(row.confidence),
      source: row.source
    }));
  }

  async remember(userId: string, input: MemoryInput): Promise<void> {
    const [existing] = await this.db
      .select()
      .from(memories)
      .where(and(eq(memories.userId, userId), eq(memories.key, input.key)))
      .limit(1);

    if (existing) {
      const existingConfidence = Number(existing.confidence);
      const incomingIsWeakInference =
        input.source === "inferred" && input.confidence < existingConfidence;
      const existingIsExplicit =
        existing.source.startsWith("explicit") && existingConfidence >= 0.9;

      if (existingIsExplicit && incomingIsWeakInference) {
        return;
      }

      const confidence =
        input.source === "inferred" && existing.source === "inferred"
          ? Math.min(0.9, Math.max(existingConfidence, input.confidence) + 0.1)
          : Math.max(existingConfidence, input.confidence);

      await this.db
        .update(memories)
        .set({
          value: input.value,
          category: input.category,
          confidence: confidence.toFixed(3),
          source: input.source,
          updatedAt: new Date()
        })
        .where(eq(memories.id, existing.id));
      return;
    }

    await this.db.insert(memories).values({
      userId,
      key: input.key,
      value: input.value,
      category: input.category,
      confidence: input.confidence.toFixed(3),
      source: input.source
    });
  }
}
