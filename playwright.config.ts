import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'tests/browser',outputDir:'build/browser-results',reporter:[['list'],['json',{outputFile:'build/browser-report.json'}]],use:{viewport:{width:1440,height:1000},headless:true,launchOptions:process.env.EU5_QA_CHROMIUM?{executablePath:process.env.EU5_QA_CHROMIUM}:{}},workers:1});
