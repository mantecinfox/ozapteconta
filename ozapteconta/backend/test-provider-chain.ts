// Test script: Verify AI Providers in Database
import * as dotenv from "dotenv";
dotenv.config();
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function testProviderChain() {
  console.log("🧪 Testing AI Provider Chain Configuration\n");

  try {
    // Test 1: Check AI providers in database
    console.log("1️⃣  Checking AI Providers in Database...\n");
    const providers = await prisma.aiProviderConfig.findMany({
      orderBy: { id: "asc" },
    });

    if (providers.length === 0) {
      console.log("   ⚠️  No providers configured in database!");
      console.log("   Run migration or seed script to initialize providers.\n");
    } else {
      console.log("   Found " + providers.length + " providers:\n");
      providers.forEach((p) => {
        console.log(`   Provider: ${p.provider}`);
        console.log(`   - Enabled: ${p.enabled ? "✅" : "❌"}`);
        console.log(`   - Model: ${p.model || "default"}`);
        console.log(`   - Has API Key: ${p.apiKey ? "✅" : "❌"}`);
        console.log("");
      });
    }

    // Test 2: Verify provider chain order
    console.log("2️⃣  Provider Chain Order (Groq → Abacus → Gemini):\n");
    const enabledProviders = providers.filter((p) => p.enabled);
    if (enabledProviders.length > 0) {
      const priority = ["GROQ", "ABACUS", "GEMINI", "OPENAI", "GROK", "OLLAMA"];
      const sorted = [...enabledProviders].sort((a, b) => {
        const ai = priority.indexOf(a.provider);
        const bi = priority.indexOf(b.provider);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });

      sorted.forEach((p, idx) => {
        const order =
          idx === 0
            ? "🥇 PRIMARY"
            : idx === 1
              ? "🥈 FALLBACK 1"
              : idx === 2
                ? "🥉 FALLBACK 2"
                : `#${idx + 1}`;
        console.log(`   ${order}: ${p.provider}`);
      });
      console.log("");
    }

    // Test 3: Check system settings
    console.log("3️⃣  System Settings:\n");
    const settings = await prisma.systemSetting.findMany({
      where: {
        key: {
          in: [
            "abacus_audio_model_chain",
            "groq_whisper_enabled",
            "default_ai_provider",
          ],
        },
      },
    });

    if (settings.length > 0) {
      settings.forEach((s) => {
        console.log(`   ${s.key}: ${s.value}`);
      });
    } else {
      console.log("   ℹ️  No specific AI settings configured (using defaults)");
    }
    console.log("");

    // Test 4: Summary
    console.log("4️⃣  Configuration Summary:\n");
    const groq = providers.find((p) => p.provider === "GROQ")?.enabled;
    const abacus = providers.find((p) => p.provider === "ABACUS")?.enabled;
    const gemini = providers.find((p) => p.provider === "GEMINI")?.enabled;

    console.log(`   Groq: ${groq ? "✅ ENABLED" : "❌ DISABLED"}`);
    console.log(`   Abacus: ${abacus ? "✅ ENABLED" : "❌ DISABLED"}`);
    console.log(`   Gemini: ${gemini ? "✅ ENABLED" : "❌ DISABLED"}`);
    console.log("");

    if (groq && abacus && gemini) {
      console.log("✅ Full chain configured and ready!");
      console.log("   - Text processing: Groq → Abacus → Gemini");
      console.log("   - Audio processing: Groq Whisper → Groq LLM → Abacus → Gemini");
      console.log("");
      console.log("💰 Cost per $1 USD:");
      console.log("   - Groq: 20M input tokens (best for text)");
      console.log("   - Abacus: 3.44M input tokens (best for audio)");
      console.log("   - Gemini: Fallback for reliability");
    } else {
      console.log("⚠️  Some providers are disabled. Check database configuration.");
    }

    await prisma.$disconnect();
  } catch (error) {
    console.error("❌ Error:", error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

testProviderChain();
