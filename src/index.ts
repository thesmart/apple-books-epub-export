#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { $ } from 'zx';

const program = new Command();

if (!process.env.HOME) {
  throw new Error('Expected the $HOME environment variable to be set.');
}
const DEFAULT_APPLE_BOOKS_LIBRARY_PATH = path.join(
  process.env.HOME,
  'Library/Mobile Documents/iCloud~com~apple~iBooks/Documents',
);

const getAppleBooksEpubs = function (pathArg = DEFAULT_APPLE_BOOKS_LIBRARY_PATH) {
  try {
    const pathStats = fs.statSync(pathArg);
    if (!pathStats.isDirectory()) {
      console.error('The provided path is not a directory:', pathArg);
      process.exit(1);
    }
  } catch (err) {
    console.error('The provided path is not readable:', pathArg);
    process.exit(1);
  }

  const allFiles = fs.readdirSync(pathArg, { withFileTypes: true });
  const ePubFileNames = allFiles
    .filter((f) => {
      if (f.isDirectory() && f.name.toLowerCase().endsWith('.epub')) {
        const mimeFilePath = path.join(pathArg, f.name, 'mimetype');
        try {
          const mimeType = fs.readFileSync(mimeFilePath, { encoding: 'utf-8' });
          return mimeType === 'application/epub+zip';
        } catch (err) {
          return false;
        }
      }
      return false;
    })
    .map((stat) => stat.name);

  if (!ePubFileNames.length) {
    console.error('Found no ePub folders in path:', pathArg);
    process.exit(1);
  }
  return ePubFileNames;
};

/**
 * Makes a ePub zip file by putting the mimetype file first.
 */
const makeEpubZip = function (inputPathArg: string, ePubFileName: string, outputPathArg: string) {
  try {
    const pathStats = fs.statSync(inputPathArg);
    if (!pathStats.isDirectory()) {
      console.error(`The provided path is not a directory (${inputPathArg})`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`The provided path is not readable (${inputPathArg})`);
    process.exit(1);
  }

  // Process each epub file
  const epubFolderPath = path.join(inputPathArg, ePubFileName);
  const outputFilePath = path.join(
    outputPathArg,
    /\.epub$/.test(ePubFileName) ? ePubFileName : `${ePubFileName}.epub`,
  );

  try {
    // Create a zip file with the mimetype file first (required for valid epub)
    $.sync`cd ${epubFolderPath} && \
      zip ${outputFilePath} mimetype && \
      zip -r  ${outputFilePath} * -x mimetype`;

    console.log(`Successfully created (${outputFilePath})`);
  } catch (error) {
    console.error(`Failed to create epub for (${epubFolderPath}):`, error);
    process.exit(1);
  }
};

program
  .name('apple-books-epubs')
  .description('Utility for working with ePub folders from an Apple Books library.')
  .version('1.0.0');

program
  .command('list')
  .argument('[path]', 'Path to a Apple Books library', DEFAULT_APPLE_BOOKS_LIBRARY_PATH)
  .action((path) => {
    const ePubFileNames = getAppleBooksEpubs(path);
    for (const name of ePubFileNames) {
      console.info(name);
    }
  });

program
  .command('convert')
  .argument('[path]', 'Path to a Apple Books library', DEFAULT_APPLE_BOOKS_LIBRARY_PATH)
  .argument('[outputPath]', 'Path to output epub files', null)
  .option('-t --tmp', 'output to a temporary folder')
  .action((pathArg, outputPathArg, options) => {
    // If --tmp flag is set, create a temporary folder for outputPath
    if (!outputPathArg && options.tmp) {
      outputPathArg = fs.mkdtempSync(path.join(os.tmpdir(), 'apple-books-'));
      console.info(`Using temporary output directory: ${outputPathArg}`);
      if (!fs.existsSync(outputPathArg)) {
        fs.mkdirSync(outputPathArg, { recursive: true });
      }
    } else if (!outputPathArg) {
      outputPathArg = process.cwd();
    }

    const ePubFileNames = getAppleBooksEpubs(pathArg);
    for (const name of ePubFileNames) {
      console.info(`Converting (${name}) ...`);
      makeEpubZip(pathArg, name, outputPathArg);
    }
  });

program.parse();
