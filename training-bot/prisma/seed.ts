import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { randomBytes, scryptSync } from "crypto";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const db = new PrismaClient({ adapter });

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

async function main() {
  console.log("Seeding database...");

  const adminEmail = process.env.ADMIN_EMAIL || "admin@sitezeus.com";
  const adminPassword = process.env.ADMIN_PASSWORD || "changeme123";

  const existingAdmin = await db.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    await db.user.create({
      data: {
        name: "Admin",
        email: adminEmail,
        hashedPassword: await hashPassword(adminPassword),
        role: "ADMIN",
      },
    });
    console.log(`Created admin user: ${adminEmail}`);
  }

  const traineeEmail = "trainee@sitezeus.com";
  const existingTrainee = await db.user.findUnique({ where: { email: traineeEmail } });
  if (!existingTrainee) {
    await db.user.create({
      data: {
        name: "Demo Trainee",
        email: traineeEmail,
        hashedPassword: await hashPassword("trainee123"),
        role: "TRAINEE",
      },
    });
    console.log(`Created trainee user: ${traineeEmail}`);
  }

  const existingRules = await db.ruleSet.findFirst({ where: { isActive: true } });
  if (!existingRules) {
    await db.ruleSet.create({
      data: {
        name: "Default SiteZeus Rules",
        isActive: true,
        rubricJson: {
          opener: { label: "Opener and permission/clarity", max: 10 },
          personaRelevance: { label: "Persona relevance", max: 15 },
          valueProposition: { label: "SiteZeus value proposition", max: 15 },
          discovery: { label: "Discovery question quality", max: 10 },
          objectionHandling: { label: "Objection handling", max: 20 },
          meetingAsk: { label: "Meeting ask / close", max: 15 },
          conversationalControl: { label: "Conversational control and brevity", max: 10 },
          professionalismCompliance: { label: "Professionalism/compliance", max: 5 },
        },
        requiredKeywordsJson: [
          "location intelligence",
          "expand smarter",
          "AI and machine learning",
          "market planning",
          "site selection",
          "portfolio",
          "what is and isn't working",
          "market map",
          "due diligence",
          "franchisee confidence",
          "data-backed",
          "current locations",
          "future expansion",
          "boots on the right ground",
        ],
        bannedPhrasesJson: [
          "guarantee success",
          "guaranteed to do well",
          "guaranteed profitability",
          "certain financial outcome",
          "promise you'll see returns",
        ],
        objectionRulesJson: [
          {
            name: "Busy / Call Back Later",
            triggerKeywords: ["busy", "call back", "reach back out", "after Q1", "not a good time"],
            preferredStrategy: "Acknowledge timing. Do not try to change their priority. Ask for a low-friction 15-minute meeting to get on their radar.",
            strongExample: "Totally understand. I'm not looking to change your priorities today. I was hoping to grab 15 minutes to show you what we do so we're at least on your radar when expansion becomes a priority again. Would this week or next week be better?",
            weakExample: "But this is really important and you should hear about it now.",
          },
          {
            name: "Using Buxton",
            triggerKeywords: ["buxton", "we use buxton"],
            preferredStrategy: "Acknowledge. Position SiteZeus as differentiated around AI integration, faster insights, and potentially more accurate modeling. Ask for 15 minutes to compare.",
            strongExample: "That makes sense. A lot of teams we talk with have used Buxton. Where SiteZeus tends to be different is how we bring AI and brand-specific data into market planning and site selection so teams can get to insights faster. I'd love to show you the difference in 15 minutes. Would this week or next week be better?",
            weakExample: "Buxton is outdated, you should switch to us.",
          },
          {
            name: "Don't Understand What You Do",
            triggerKeywords: ["don't understand", "what do you do", "what does it do", "what is sitezeus"],
            preferredStrategy: "Explain simply. Tie to current portfolio and repeatable growth.",
            strongExample: "We help brands understand what is and isn't working across their current locations, then use that data to make future site selection and market planning more repeatable. The idea is to make expansion decisions simpler and more data-backed. Would this week or next week be better for a quick 15-minute overview?",
            weakExample: "We're an AI-powered location intelligence platform leveraging machine learning algorithms for geospatial analysis...",
          },
          {
            name: "Budget Issues",
            triggerKeywords: ["budget", "nothing getting approved", "budget season", "no budget"],
            preferredStrategy: "Remove pressure. Ask only for awareness/demo, not a buying decision.",
            strongExample: "Totally understand. I'm not asking you to make a buying decision right now. I'd just like to give you a quick 15-minute overview so you know what's possible when timing opens back up. Would later this week or next week work?",
            weakExample: "We have flexible pricing options that can fit any budget.",
          },
          {
            name: "AI Skepticism",
            triggerKeywords: ["don't use ai", "don't need ai", "not sure about ai", "ai isn't necessary"],
            preferredStrategy: "Respect concern. Explain AI as optional assistance, not replacement. Use boots-on-the-right-ground language carefully.",
            strongExample: "I get that. A lot of teams still value the boots-on-the-ground approach, and we're not trying to replace that. The goal is to make sure your team has the data to know which ground is worth prioritizing. Would it be worth 15 minutes to see how teams use it as support, not a replacement?",
            weakExample: "AI is the future, you need to get on board.",
          },
          {
            name: "Grow Through Acquisition",
            triggerKeywords: ["acquisition", "grow through acquisition", "we acquire"],
            preferredStrategy: "Tie SiteZeus to acquisition due diligence.",
            strongExample: "That makes sense. SiteZeus can still be helpful there because it gives the team a first line of due diligence on whether the locations or markets you're taking on are likely to be profitable and where the biggest opportunities or risks are. Worth a quick 15-minute look?",
            weakExample: "Well, you should also consider organic growth.",
          },
          {
            name: "Email Me",
            triggerKeywords: ["email", "send me something", "just email", "send info"],
            preferredStrategy: "Acknowledge. Do not let email become the only next step. Set a callback.",
            strongExample: "No problem. I'll send something over, but it'll make more sense with a quick conversation. I'll give you a call back later today and see if we can find 15 minutes.",
            weakExample: "Sure, I'll send you an email right away! *ends call*",
          },
          {
            name: "Using Placer.ai",
            triggerKeywords: ["placer", "placer.ai"],
            preferredStrategy: "Acknowledge. Differentiate around ingesting brand-specific data and modeling around the brand's own portfolio.",
            strongExample: "I completely understand. The biggest difference is that SiteZeus can ingest your brand's own performance data and build market mapping and models around what actually works for your concept. A lot of teams use traffic or location data, but we're trying to connect it back to your brand's specific success patterns. Worth a 15-minute comparison?",
            weakExample: "Placer.ai only has foot traffic data, we're better.",
          },
          {
            name: "Had SiteZeus Before",
            triggerKeywords: ["had sitezeus", "used sitezeus", "used you guys", "tried sitezeus"],
            preferredStrategy: "Mention AI and platform evolution. Ask to show updates.",
            strongExample: "Fair question. AI and site selection have changed a lot recently, and the platform has evolved with that. I'd love to show you what's different now and see if it's worth revisiting. Would this week or next week be better?",
            weakExample: "Yeah, we're a lot better now. Let me explain everything that changed.",
          },
          {
            name: "Not Expanding",
            triggerKeywords: ["not expanding", "not growing", "holding steady"],
            preferredStrategy: "Tie to portfolio optimization, not just expansion.",
            strongExample: "Totally understand. That's actually still relevant for us because a lot of teams use SiteZeus to understand what is and isn't working in their current portfolio before they start expanding again. Would it be worth seeing how that works?",
            weakExample: "Well, you should be expanding. The market is great right now.",
          },
          {
            name: "Multiyear Contract with Competitor",
            triggerKeywords: ["multiyear", "multi-year", "contract with", "signed with sitewise", "sitewise"],
            preferredStrategy: "Acknowledge. Position as future awareness.",
            strongExample: "That makes sense. I'm not asking you to rip anything out. Worst case, you see something that could be useful down the road or gives you a comparison point. Would 15 minutes next week be too much?",
            weakExample: "You should break that contract, we're much better.",
          },
          {
            name: "Budget Not Until Next Year",
            triggerKeywords: ["next year", "wouldn't have budget", "budget until next"],
            preferredStrategy: "No decision pressure. Schedule exploratory demo.",
            strongExample: "Understood. I'm not looking for a decision today. I'd just like to show you the product and see if there's a potential fit down the road. Would a quick 15-minute overview this week or next be reasonable?",
            weakExample: "We can offer a discount if you sign before end of quarter.",
          },
        ],
      },
    });
    console.log("Created default rules");
  }

  const existingContext = await db.companyContext.findFirst({ where: { isActive: true } });
  if (!existingContext) {
    await db.companyContext.create({
      data: {
        isActive: true,
        positioning:
          "SiteZeus is a location intelligence platform that helps businesses expand smarter using AI, machine learning, market planning, portfolio analysis, and site-selection intelligence. SiteZeus helps brands understand what is and is not working in their current portfolio, identify market/site patterns tied to success or failure, and apply those insights to future expansion. The platform supports real estate teams, development leaders, franchise development teams, and companies evaluating growth, acquisitions, or new markets.",
        valuePropsJson: [
          "AI-powered location intelligence for smarter expansion",
          "Understand what is and isn't working in current portfolio",
          "Brand-specific modeling using your own performance data",
          "Market planning and site selection in one platform",
          "First line of due diligence for new locations and markets",
          "Data-backed support for franchisee confidence",
          "Portfolio optimization before expansion",
        ],
        personasJson: {
          CHIEF_DEVELOPMENT_OFFICER: {
            cares_about: [
              "growth strategy",
              "expansion confidence",
              "capital allocation",
              "market prioritization",
              "scaling repeatable success",
              "risk reduction",
              "executive visibility",
            ],
            behavior:
              "More strategic. Will challenge ROI, timing, budget, and whether AI is necessary. May say they already have a process or a vendor.",
          },
          DIRECTOR_OF_REAL_ESTATE: {
            cares_about: [
              "site selection",
              "trade areas",
              "white-space analysis",
              "existing store performance",
              "speed of due diligence",
              "market/site-level data",
              "optimizing current portfolio",
            ],
            behavior:
              "Practical and skeptical. Will ask 'what does it do?' May mention boots-on-the-ground process. May mention Buxton, Sitewise, Placer.ai, or previous SiteZeus experience.",
          },
          DIRECTOR_OF_FRANCHISE_DEVELOPMENT: {
            cares_about: [
              "franchisee confidence",
              "market planning",
              "territory strategy",
              "showing data to prospects/franchisees",
              "validating which markets should be sold or prioritized",
              "improving development conversations",
            ],
            behavior:
              "Cares about selling expansion opportunities and supporting franchisees. May ask how AI helps franchise development. May object that they grow through acquisition or that franchisees pick markets themselves.",
          },
        },
        competitorNotesJson: {
          Buxton:
            "Traditional location analytics. SiteZeus differentiates with AI integration, faster insights, and brand-specific modeling.",
          "Placer.ai":
            "Foot traffic / location data platform. SiteZeus differentiates by ingesting the brand's own performance data and building models around what works for their specific concept.",
          Sitewise:
            "Market research and analytics. Position SiteZeus as a more modern, AI-driven alternative with tighter platform integration.",
        },
        discoveryQuestionsJson: [
          "Are you leveraging any AI tools when it comes to site selection / market planning / franchise growth?",
          "How are you currently evaluating new markets or sites?",
          "What does your due diligence process look like today?",
          "How do you decide which markets to prioritize?",
          "Are you looking at your current portfolio performance to inform future expansion?",
        ],
        keywordsJson: [
          "location intelligence",
          "expand smarter",
          "AI and machine learning",
          "market planning",
          "site selection",
          "portfolio",
          "what is and isn't working",
          "market map",
          "due diligence",
          "franchisee confidence",
          "data-backed",
          "current locations",
          "future expansion",
          "boots on the right ground",
        ],
        cautionPhrasesJson: [
          "guarantee success",
          "guaranteed to do well",
          "guaranteed profitability",
          "certain financial outcome",
        ],
        openersJson: {
          franchise_development:
            "Hey [Name], are you still running franchise development over at [Company]? Good to hear. My name is [BDR] with SiteZeus. I was calling to see if you're leveraging any AI tools when it comes to market planning and franchise growth.",
          real_estate:
            "Hey [Name], are you still running real estate over at [Company]? Great to hear. My name is [BDR] with SiteZeus. We help brands in your space expand smarter with AI and location intelligence. I was looking to see if I could get you on a quick 15-minute meeting this week or next to discuss whether we could be a good fit.",
          general:
            "Hey [Name], my name is [BDR] with SiteZeus. We're a location intelligence platform that helps brands like [Company] expand smarter using AI and data. I was hoping to grab 15 minutes to see if we might be a good fit.",
        },
        closesJson: [
          "Would this week or next week be better for a quick 15-minute overview?",
          "I'd love to show you the difference in 15 minutes. Would this week or next work?",
          "Would a quick 15-minute overview this week or next be reasonable?",
        ],
        aiNotesJson: [
          "Always stay in character as a prospect. Never coach during the call.",
          "Keep responses short and realistic. Busy executives don't give long answers.",
          "Only agree to a meeting when the trainee clearly earns it.",
          "Push back on vague or generic pitches.",
          "If the trainee overtalks, interrupt or say you're busy.",
        ],
      },
    });
    console.log("Created default company context");
  }

  const existingDocs = await db.knowledgeDocument.count();
  if (existingDocs === 0) {
    const objectionDoc = await db.knowledgeDocument.create({
      data: {
        sourceType: "MANUAL",
        title: "Objections & Overcoming Guide",
        content: OBJECTIONS_CONTENT,
        tags: ["objection", "overcoming", "training"],
        approved: true,
      },
    });

    const chunks = splitIntoChunks(OBJECTIONS_CONTENT);
    for (const chunk of chunks) {
      await db.knowledgeChunk.create({
        data: {
          documentId: objectionDoc.id,
          content: chunk,
          tags: ["objection", "training"],
        },
      });
    }

    const openerDoc = await db.knowledgeDocument.create({
      data: {
        sourceType: "MANUAL",
        title: "Cold Call Openers by Persona",
        content: OPENERS_CONTENT,
        tags: ["opener", "persona", "training"],
        approved: true,
      },
    });

    const openerChunks = splitIntoChunks(OPENERS_CONTENT);
    for (const chunk of openerChunks) {
      await db.knowledgeChunk.create({
        data: {
          documentId: openerDoc.id,
          content: chunk,
          tags: ["opener", "training"],
        },
      });
    }

    console.log("Created seed training documents");
  }

  console.log("Seed complete!");
}

function splitIntoChunks(text: string, maxSize = 800): string[] {
  const paragraphs = text.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    if (current.length + para.length > maxSize && current.length > 0) {
      chunks.push(current.trim());
      current = para;
    } else {
      current += (current ? "\n\n" : "") + para;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

const OBJECTIONS_CONTENT = `Objection: "I'm a little busy right now. Reach back out after Q1."
Preferred approach: Acknowledge timing. Do not try to change their priority. Ask for a low-friction 15-minute meeting to get on their radar before they are ready to make a move.
Example: "Totally understand. I'm not looking to change your priorities today. I was hoping to grab 15 minutes to show you what we do so we're at least on your radar when expansion becomes a priority again. Would this week or next week be better?"

Objection: "We use Buxton right now."
Preferred approach: Acknowledge. Position SiteZeus as differentiated around AI integration, faster insights, and potentially more accurate modeling. Ask for 15 minutes to compare value.
Example: "That makes sense. A lot of teams we talk with have used Buxton. Where SiteZeus tends to be different is how we bring AI and brand-specific data into market planning and site selection so teams can get to insights faster. I'd love to show you the difference in 15 minutes. Would this week or next week be better?"

Objection: "I don't understand what you guys do."
Preferred approach: Explain simply. Tie to current portfolio and repeatable growth.
Example: "We help brands understand what is and isn't working across their current locations, then use that data to make future site selection and market planning more repeatable. The idea is to make expansion decisions simpler and more data-backed. Would this week or next week be better for a quick 15-minute overview?"

Objection: "We just went through budget season. Nothing is getting approved right now."
Preferred approach: Remove pressure. Ask only for awareness/demo, not a buying decision.
Example: "Totally understand. I'm not asking you to make a buying decision right now. I'd just like to give you a quick 15-minute overview so you know what's possible when timing opens back up. Would later this week or next week work?"

Objection: "We don't use AI."
Preferred approach: Respect concern. Explain AI as optional assistance, not replacement.
Example: "I get that. A lot of teams still value the boots-on-the-ground approach, and we're not trying to replace that. The goal is to make sure your team has the data to know which ground is worth prioritizing. Would it be worth 15 minutes to see how teams use it as support, not a replacement?"

Objection: "We just grow through acquisition."
Preferred approach: Tie SiteZeus to acquisition due diligence.
Example: "That makes sense. SiteZeus can still be helpful there because it gives the team a first line of due diligence on whether the locations or markets you're taking on are likely to be profitable and where the biggest opportunities or risks are. Worth a quick 15-minute look?"

Objection: "I'm not sure we need AI for site selection."
Preferred approach: Clarify that AI is part of the platform, but value exists with or without AI.
Example: "Completely fair. SiteZeus can be useful even without leaning heavily on AI because the market planning and portfolio data are valuable on their own. Out of curiosity, is the hesitation around AI accuracy, adoption, or just not wanting to change the current process?"

Objection: "Even if we liked it, we wouldn't have budget approval until next year."
Preferred approach: No decision pressure. Schedule exploratory demo.
Example: "Understood. I'm not looking for a decision today. I'd just like to show you the product and see if there's a potential fit down the road. Would a quick 15-minute overview this week or next be reasonable?"

Objection: "We just signed a multiyear contract with Sitewise."
Preferred approach: Acknowledge. Position as future awareness.
Example: "That makes sense. I'm not asking you to rip anything out. Worst case, you see something that could be useful down the road or gives you a comparison point. Would 15 minutes next week be too much?"

Objection: "Can you just email it to me? I'm in the middle of a meeting."
Preferred approach: Acknowledge. Do not let email become the only next step. Set a callback.
Example: "No problem. I'll send something over, but it'll make more sense with a quick conversation. I'll give you a call back later today and see if we can find 15 minutes."

Objection: "We already use Placer.ai and it's working for us."
Preferred approach: Differentiate around ingesting brand-specific data.
Example: "I completely understand. The biggest difference is that SiteZeus can ingest your brand's own performance data and build market mapping and models around what actually works for your concept. A lot of teams use traffic or location data, but we're trying to connect it back to your brand's specific success patterns. Worth a 15-minute comparison?"

Objection: "We had SiteZeus in the past. What has changed?"
Preferred approach: Mention AI and platform evolution. Ask to show updates.
Example: "Fair question. AI and site selection have changed a lot recently, and the platform has evolved with that. I'd love to show you what's different now and see if it's worth revisiting. Would this week or next week be better?"

Objection: "We're not really expanding right now."
Preferred approach: Tie to portfolio optimization, not just expansion.
Example: "Totally understand. That's actually still relevant for us because a lot of teams use SiteZeus to understand what is and isn't working in their current portfolio before they start expanding again. Would it be worth seeing how that works?"`;

const OPENERS_CONTENT = `Franchise Development Opener:
"Hey [Name], are you still running franchise development over at [Company]?"
If yes: "Good to hear. My name is [BDR] with SiteZeus. I was calling to see if you're leveraging any AI tools when it comes to market planning and franchise growth."
If they ask what SiteZeus does: "We help identify which markets your business is most likely to perform well in, which can help boost franchisee confidence by giving them data-backed support around where a location should work."

Real Estate Opener:
"Hey [Name], are you still running real estate over at [Company]?"
If yes: "Great to hear. My name is [BDR] with SiteZeus. We help brands in your space expand smarter with AI and location intelligence. I was looking to see if I could get you on a quick 15-minute meeting this week or next to discuss whether we could be a good fit."
Alternative question: "Are you leveraging any AI tools when it comes to site selection?"

When prospect asks "What does it do?" for Real Estate:
"The AI looks across your store portfolio, finds patterns between what is working and what isn't, identifies area traits that correlate with success or underperformance, and brings that into future expansion and site-selection decisions."`;

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
