#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { resolve } from 'path';
import { getVectorStore } from './core/vector-store.js';
import { getIngestionService } from './embeddings/ingestion.js';
import { getRetriever } from './retrieval/retriever.js';
import { createOrchestrator } from './agents/orchestrator.js';
import { createChildLogger } from './utils/logger.js';

const logger = createChildLogger('cli');

const program = new Command();

program
  .name('claude-rag')
  .description('Claude RAG Plugin - Intelligent codebase search and analysis')
  .version('1.0.0');

// Index command
program
  .command('index <path>')
  .description('Index a directory or file into the RAG system')
  .option('-p, --project <name>', 'Project name for the indexed content')
  .option('-f, --force', 'Force re-indexing even if files haven\'t changed')
  .option('-w, --watch', 'Watch for file changes and re-index automatically')
  .action(async (path: string, options: { project?: string; force?: boolean; watch?: boolean }) => {
    const spinner = ora('Initializing...').start();

    try {
      const resolvedPath = resolve(path);
      const ingestionService = getIngestionService();

      spinner.text = 'Indexing files...';

      const stats = await ingestionService.ingestDirectory(resolvedPath, {
        projectName: options.project,
        forceReindex: options.force,
        onProgress: (progress) => {
          spinner.text = `Indexing: ${progress.processedFiles}/${progress.totalFiles} files (${progress.totalChunks} chunks)`;
        },
      });

      spinner.succeed(chalk.green('Indexing complete!'));

      console.log('\n' + chalk.bold('Summary:'));
      console.log(`  Total files:     ${stats.totalFiles}`);
      console.log(`  Processed:       ${chalk.green(stats.processedFiles)}`);
      console.log(`  Skipped:         ${chalk.yellow(stats.skippedFiles)}`);
      console.log(`  Total chunks:    ${stats.totalChunks}`);
      console.log(`  Errors:          ${stats.errors.length > 0 ? chalk.red(stats.errors.length) : '0'}`);

      if (stats.errors.length > 0) {
        console.log('\n' + chalk.red('Errors:'));
        stats.errors.slice(0, 5).forEach((err) => {
          console.log(`  - ${err.file}: ${err.error}`);
        });
        if (stats.errors.length > 5) {
          console.log(`  ... and ${stats.errors.length - 5} more errors`);
        }
      }

      if (options.watch) {
        console.log('\n' + chalk.blue('Watching for changes... (Ctrl+C to stop)'));
        ingestionService.startWatching(resolvedPath, {
          projectName: options.project,
        });

        // Keep process alive
        process.on('SIGINT', () => {
          ingestionService.stopWatching();
          console.log('\n' + chalk.yellow('Stopped watching.'));
          process.exit(0);
        });
      }
    } catch (error) {
      spinner.fail(chalk.red('Indexing failed'));
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Search command
program
  .command('search <query>')
  .description('Search the indexed codebase')
  .option('-k, --top-k <number>', 'Number of results to return', '10')
  .option('-t, --type <extensions>', 'Filter by file types (comma-separated)')
  .option('-j, --json', 'Output results as JSON')
  .action(async (query: string, options: { topK: string; type?: string; json?: boolean }) => {
    const spinner = ora('Searching...').start();

    try {
      const vectorStore = getVectorStore();
      await vectorStore.initialize();

      const retriever = getRetriever();
      const topK = parseInt(options.topK, 10);

      const results = await retriever.retrieve({
        query,
        topK,
        filters: options.type
          ? { fileType: { $in: options.type.split(',').map((t) => `.${t.trim()}`) } }
          : undefined,
      });

      spinner.stop();

      if (results.length === 0) {
        console.log(chalk.yellow('No results found.'));
        return;
      }

      if (options.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      console.log(chalk.bold(`\nFound ${results.length} results:\n`));

      results.forEach((result, index) => {
        const score = (result.score * 100).toFixed(1);
        const scoreColor = result.score > 0.8 ? chalk.green : result.score > 0.6 ? chalk.yellow : chalk.red;

        console.log(chalk.bold(`${index + 1}. ${result.document.metadata.filePath}`));
        console.log(`   Score: ${scoreColor(score + '%')} | Lines: ${result.document.metadata.startLine || 'N/A'}-${result.document.metadata.endLine || 'N/A'}`);
        console.log(chalk.dim('   ' + result.document.content.slice(0, 150).replace(/\n/g, ' ') + '...'));
        console.log();
      });
    } catch (error) {
      spinner.fail(chalk.red('Search failed'));
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Query command
program
  .command('query <question>')
  .description('Ask a question about the codebase using the AI agent')
  .option('-v, --verbose', 'Show detailed reasoning')
  .action(async (question: string, options: { verbose?: boolean }) => {
    const spinner = ora('Thinking...').start();

    try {
      const vectorStore = getVectorStore();
      await vectorStore.initialize();

      const orchestrator = createOrchestrator({ verbose: options.verbose });

      spinner.text = 'Analyzing codebase...';
      const response = await orchestrator.query(question);

      spinner.stop();

      console.log('\n' + chalk.bold('Answer:') + '\n');
      console.log(response);
    } catch (error) {
      spinner.fail(chalk.red('Query failed'));
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Status command
program
  .command('status')
  .description('Show the status of the RAG system')
  .action(async () => {
    const spinner = ora('Getting status...').start();

    try {
      const vectorStore = getVectorStore();
      await vectorStore.initialize();

      const count = await vectorStore.getDocumentCount();
      const collections = await vectorStore.listCollections();

      spinner.stop();

      console.log('\n' + chalk.bold('RAG System Status') + '\n');
      console.log(`  Status:          ${chalk.green('Active')}`);
      console.log(`  Documents:       ${count}`);
      console.log(`  Collections:     ${collections.join(', ') || 'None'}`);
    } catch (error) {
      spinner.fail(chalk.red('Status check failed'));
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Clear command
program
  .command('clear')
  .description('Clear all indexed documents')
  .option('-y, --yes', 'Skip confirmation')
  .action(async (options: { yes?: boolean }) => {
    if (!options.yes) {
      console.log(chalk.yellow('This will delete all indexed documents.'));
      console.log('Use --yes to confirm.');
      return;
    }

    const spinner = ora('Clearing documents...').start();

    try {
      const vectorStore = getVectorStore();
      await vectorStore.initialize();
      await vectorStore.deleteCollection();

      spinner.succeed(chalk.green('All documents cleared.'));
    } catch (error) {
      spinner.fail(chalk.red('Clear failed'));
      console.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  });

// Serve command (MCP server)
program
  .command('serve')
  .description('Start the MCP server for Claude Code integration')
  .action(async () => {
    console.log(chalk.blue('Starting MCP server...'));
    console.log(chalk.dim('The server will communicate via stdio.'));

    // Dynamically import and run the MCP server
    await import('./mcp/server.js');
  });

// Init command
program
  .command('init')
  .description('Initialize configuration files in the current directory')
  .action(async () => {
    const { writeFileSync, existsSync } = await import('fs');

    const configPath = '.claude-rag.json';

    if (existsSync(configPath)) {
      console.log(chalk.yellow('Configuration file already exists.'));
      return;
    }

    const defaultConfig = {
      chromadb: {
        host: 'localhost',
        port: 8000,
        collection: 'claude_rag_documents',
      },
      embeddings: {
        provider: 'openai',
        model: 'text-embedding-3-small',
      },
      retrieval: {
        topK: 10,
        minScore: 0.7,
      },
      ingestion: {
        chunkSize: 1000,
        chunkOverlap: 200,
        excludePatterns: [
          '**/node_modules/**',
          '**/dist/**',
          '**/.git/**',
        ],
      },
    };

    writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    console.log(chalk.green(`Created ${configPath}`));
    console.log(chalk.dim('Edit this file to customize your configuration.'));
  });

// Parse and run
program.parse();
