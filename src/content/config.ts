import { defineCollection, z } from 'astro:content';

const scenarios = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    series: z.string(),
    seriesName: z.string(),
    volume: z.number(),
    scenarioSlug: z.string(),
    subject: z.string(),
    players: z.string(),
    age: z.string(),
    time: z.string(),
    difficulty: z.string(),
    synopsis: z.string(),
    characters: z.array(z.object({
      id: z.string(),
      name: z.string(),
      role: z.string(),
      isNPC: z.boolean().default(false),
    })),
  }),
});

export const collections = { scenarios };
