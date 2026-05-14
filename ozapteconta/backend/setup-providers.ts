// Enable Groq and Gemini in database + update models to latest
import * as dotenv from "dotenv";
dotenv.config();
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function setupProviders() {
  console.log("🔧 Updating AI Providers Configuration...\n");

  try {
    // Update Groq
    console.log("1️⃣  Configuring GROQ...");
    await prisma.aiProviderConfig.update({
      where: { provider: "GROQ" },
      data: {
        enabled: true,
        model: "llama-3.1-8b-instant",
        apiKey: process.env.GROQ_API_KEY || "sk-placeholder-groq",
        isDefault: true,
      },
    });
    console.log("   ✅ Groq enabled (Llama 3.1 8B - fastest & cheapest)");

    // Update Abacus
    console.log("\n2️⃣  Configuring ABACUS...");
    await prisma.aiProviderConfig.update({
      where: { provider: "ABACUS" },
      data: {
        enabled: true,
        model: "gpt-4o-audio-preview",
        apiUrl: process.env.ABACUS_API_URL || "https://routellm.abacus.ai",
      },
    });
    console.log("   ✅ Abacus enabled (native audio + text)");

    // Update Gemini
    console.log("\n3️⃣  Configuring GEMINI...");
    await prisma.aiProviderConfig.update({
      where: { provider: "GEMINI" },
      data: {
        enabled: true,
        model: "gemini-2.5-flash",
        apiKey: process.env.GEMINI_API_KEY || "sk-placeholder-gemini",
      },
    });
    console.log("   ✅ Gemini enabled (fallback - reliable)");

    // Disable OLLAMA and others
    console.log("\n4️⃣  Disabling other providers...");
    await prisma.aiProviderConfig.update({
      where: { provider: "OLLAMA" },
      data: { enabled: false },
    });
    await prisma.aiProviderConfig.update({
      where: { provider: "OPENAI" },
      data: { enabled: false },
    });
    await prisma.aiProviderConfig.update({
      where: { provider: "GROK" },
      data: { enabled: false },
    });
    console.log("   ✅ Other providers disabled");

    // Verify new chain
    console.log("\n5️⃣  Verifying new configuration...");
    const providers = await prisma.aiProviderConfig.findMany({
      where: { enabled: true },
      orderBy: { id: "asc" },
    });

    const priority = ["GROQ", "ABACUS", "GEMINI", "OPENAI", "GROK", "OLLAMA"];
    const sorted = [...providers].sort((a, b) => {
      const ai = priority.indexOf(a.provider);
      const bi = priority.indexOf(b.provider);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

    console.log("\n✅ Final Provider Chain Order:\n");
    sorted.forEach((p, idx) => {
      const medal = ["🥇", "🥈", "🥉"];
      console.log(
        `   ${medal[idx] || `#${idx + 1}`} ${p.provider} (${p.model})`
      );
    });

    console.log("\n✅ Configuration Complete!");
    console.log("\n📋 Summary:");
    console.log("   - Text: Groq → Abacus → Gemini");
    console.log("   - Audio: Groq Whisper → Groq LLM → Abacus → Gemini");
    console.log("   - Cost: $0.05/M input (Groq) → $0.29/M (Abacus)");
    console.log("");
    console.log("🚀 System ready to process transactions!");

    await prisma.$disconnect();
  } catch (error) {
    console.error("❌ Error:", error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

setupProviders();
