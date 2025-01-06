import 'dotenv/config';

// Polyfill for Promise.withResolvers
if (!Promise.withResolvers) {
  Promise.withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: any) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}
import * as fs from 'fs/promises';
import * as path from 'path';
import { DeepSeekClient } from './deepseek-client.js';
import * as pdfjsLib from 'pdfjs-dist';
// @ts-ignore
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import chalk from 'chalk';

// Configuration Constants
const PDF_NAME = "meditations.pdf";
const BASE_DIR = path.join("book_analysis");
const PDF_DIR = path.join(BASE_DIR, "pdfs");
const KNOWLEDGE_DIR = path.join(BASE_DIR, "knowledge_bases");
const SUMMARIES_DIR = path.join(BASE_DIR, "summaries");
const PDF_PATH = path.join(PDF_DIR, PDF_NAME);
const OUTPUT_PATH = path.join(KNOWLEDGE_DIR, `${PDF_NAME.replace('.pdf', '_knowledge.json')}`);
const ANALYSIS_INTERVAL = 20;  // Set to null to skip interval analyses
const MODEL = "deepseek-chat";
const ANALYSIS_MODEL = "deepseek-chat";
const TEST_PAGES = 60;  // Set to null to process entire book

interface PageContent {
  hasContent: boolean;
  knowledge: string[];
}

async function loadOrCreateKnowledgeBase(): Promise<Record<string, any>> {
  try {
    await fs.access(OUTPUT_PATH);
    const data = await fs.readFile(OUTPUT_PATH, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function saveKnowledgeBase(knowledgeBase: string[]): Promise<void> {
  const outputPath = path.join(KNOWLEDGE_DIR, `${PDF_NAME.replace('.pdf', '')}_knowledge.json`);
  console.log(chalk.blue(`💾 Saving knowledge base (${knowledgeBase.length} items)...`));
  await fs.writeFile(outputPath, JSON.stringify({ knowledge: knowledgeBase }, null, 2));
}

async function processPage(client: DeepSeekClient, pageText: string, currentKnowledge: string[], pageNum: number): Promise<string[]> {
  console.log(chalk.yellow(`\n📖 Processing page ${pageNum + 1}...`));

  const response = await client.createCompletion({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `Analyze this page as if you're studying from a book...`
      },
      {
        role: "user",
        content: `Page text: ${pageText}`
      }
    ]
  });

  const result = response.choices[0].message;
  const hasContent = result.content !== null;
  const knowledge = hasContent && result.content ? [result.content] : [];

  if (hasContent) {
    console.log(chalk.green(`✅ Found ${knowledge.length} new knowledge points`));
  } else {
    console.log(chalk.yellow("⏭️  Skipping page (no relevant content)"));
  }

  const updatedKnowledge = [...currentKnowledge, ...knowledge];
  await saveKnowledgeBase(updatedKnowledge);
  return updatedKnowledge;
}

async function loadExistingKnowledge(): Promise<string[]> {
  const knowledgeFile = path.join(KNOWLEDGE_DIR, `${PDF_NAME.replace('.pdf', '')}_knowledge.json`);
  try {
    await fs.access(knowledgeFile);
    console.log(chalk.cyan("📚 Loading existing knowledge base..."));
    const data = await fs.readFile(knowledgeFile, 'utf-8');
    const jsonData = JSON.parse(data);
    console.log(chalk.green(`✅ Loaded ${jsonData.knowledge.length} existing knowledge points`));
    return jsonData.knowledge;
  } catch {
    console.log(chalk.cyan("🆕 Starting with fresh knowledge base"));
    return [];
  }
}

async function analyzeKnowledgeBase(client: DeepSeekClient, knowledgeBase: string[]): Promise<string> {
  if (knowledgeBase.length === 0) {
    console.log(chalk.yellow("\n⚠️  Skipping analysis: No knowledge points collected"));
    return "";
  }

  console.log(chalk.cyan("\n🤔 Generating final book analysis..."));
  const response = await client.createCompletion({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: `Create a comprehensive summary...`
      },
      {
        role: "user",
        content: `Analyze this content:\n${knowledgeBase.join('\n')}`
      }
    ]
  });

  console.log(chalk.green("✨ Analysis generated successfully!"));
  return response.choices[0].message.content || "";
}

async function setupDirectories(): Promise<void> {
  // 清除目录
  for (const dir of [KNOWLEDGE_DIR, SUMMARIES_DIR]) {
    try {
      const files = await fs.readdir(dir);
      for (const file of files) {
        await fs.unlink(path.join(dir, file));
      }
    } catch {}
  }

  // 创建目录
  for (const dir of [PDF_DIR, KNOWLEDGE_DIR, SUMMARIES_DIR]) {
    try {
      await fs.mkdir(dir, { recursive: true });
    } catch {}
  }

  // 检查并复制PDF
  try {
    await fs.access(PDF_PATH);
  } catch {
    const sourcePdf = path.join(PDF_NAME);
    try {
      await fs.access(sourcePdf);
      await fs.copyFile(sourcePdf, PDF_PATH);
      console.log(chalk.green(`📄 Copied PDF to analysis directory: ${PDF_PATH}`));
    } catch {
      throw new Error(`PDF file ${PDF_NAME} not found`);
    }
  }
}

async function saveSummary(summary: string, isFinal: boolean = false): Promise<void> {
  if (!summary) {
    console.log(chalk.yellow("⏭️  Skipping summary save: No content to save"));
    return;
  }

  const now = new Date().toISOString();
  const baseName = PDF_NAME.replace('.pdf', '');
  const summaryType = isFinal ? 'final' : 'interval';
  const summaryPath = path.join(SUMMARIES_DIR, `${baseName}_${summaryType}_${Date.now()}.md`);

  const markdownContent = `# Book Analysis: ${PDF_NAME}
Generated on: ${now}

${summary}

---
*Analysis generated using AI Book Analysis Tool*
`;

  console.log(chalk.cyan(`\n📝 Saving ${summaryType} analysis to markdown...`));
  await fs.writeFile(summaryPath, markdownContent, 'utf-8');
  console.log(chalk.green(`✅ Analysis saved to: ${summaryPath}`));
}

function printInstructions(): void {
  console.log(chalk.cyan(`
📚 PDF Book Analysis Tool 📚
---------------------------
1. Place your PDF in the same directory as this script
2. Update PDF_NAME constant with your PDF filename
3. The script will:
   - Process the book page by page
   - Extract and save knowledge points
   - Generate interval summaries (if enabled)
   - Create a final comprehensive analysis

Configuration options:
- ANALYSIS_INTERVAL: Set to null to skip interval analyses, or a number for analysis every N pages
- TEST_PAGES: Set to null to process entire book, or a number for partial processing

Press Enter to continue or Ctrl+C to exit...
`));
}

async function main(): Promise<void> {
  printInstructions();
  console.log(chalk.cyan("\nStarting processing in 3 seconds..."));
  await new Promise(resolve => setTimeout(resolve, 3000));

  await setupDirectories();
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY environment variable is required');
  }
  const client = new DeepSeekClient(apiKey);

  const knowledgeBase = await loadExistingKnowledge();
  const pdfBytes = new Uint8Array(await fs.readFile(PDF_PATH));
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/build/pdf.worker.mjs';
  const pdfDoc = await pdfjsLib.getDocument({ 
    data: pdfBytes,
    standardFontDataUrl: new URL(
      'pdfjs-dist/standard_fonts/',
      import.meta.url
    ).toString()
  }).promise;
  const pagesToProcess = TEST_PAGES || pdfDoc.numPages;

  console.log(chalk.cyan(`\n📚 Processing ${pagesToProcess} pages...`));
  for (let pageNum = 1; pageNum <= Math.min(pagesToProcess, pdfDoc.numPages); pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const content = textContent.items
      .filter(item => 'str' in item)
      .map(item => (item as { str: string }).str)
      .join(' ');

    const updatedKnowledge = await processPage(client, content, knowledgeBase, pageNum);

    if (ANALYSIS_INTERVAL && (pageNum + 1) % ANALYSIS_INTERVAL === 0 && (pageNum + 1) !== pagesToProcess) {
      console.log(chalk.cyan(`\n📊 Progress: ${pageNum + 1}/${pagesToProcess} pages processed`));
      const intervalSummary = await analyzeKnowledgeBase(client, updatedKnowledge);
      await saveSummary(intervalSummary, false);
    }

    if (pageNum + 1 === pagesToProcess) {
      console.log(chalk.cyan(`\n📊 Final page (${pageNum + 1}/${pagesToProcess}) processed`));
      const finalSummary = await analyzeKnowledgeBase(client, updatedKnowledge);
      await saveSummary(finalSummary, true);
    }
  }

  console.log(chalk.green.bold("\n✨ Processing complete! ✨"));
}

main().catch(err => {
  console.error(chalk.red('Error:', err));
  process.exit(1);
});
