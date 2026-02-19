#!/usr/bin/env node
/**
 * Coverage Report Merger
 * Combina reportes de cobertura de diferentes tipos de tests
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Configuration
const COVERAGE_DIR = path.join(__dirname);
const REPORTS_DIR = path.join(COVERAGE_DIR, 'reports');

// Coverage directories
const COVERAGE_DIRS = [
  path.join(COVERAGE_DIR, 'unit'),
  path.join(COVERAGE_DIR, 'integration'),
  path.join(COVERAGE_DIR, 'contract'),
  path.join(COVERAGE_DIR, 'e2e')
];

/**
 * Check if nyc is available
 */
function checkNyc() {
  try {
    execSync('npx nyc --version', { stdio: 'ignore' });
    return true;
  } catch (error) {
    console.error('nyc is not installed. Please install it with: npm install --save-dev nyc');
    return false;
  }
}

/**
 * Find all coverage directories that exist
 */
function findExistingCoverageDirs() {
  return COVERAGE_DIRS.filter(dir => {
    const coverageFile = path.join(dir, 'coverage-final.json');
    return fs.existsSync(coverageFile);
  });
}

/**
 * Merge coverage reports using nyc
 */
function mergeCoverageReports() {
  console.log('🔍 Finding coverage reports...');
  
  const existingDirs = findExistingCoverageDirs();
  
  if (existingDirs.length === 0) {
    console.error('❌ No coverage reports found');
    process.exit(1);
  }
  
  console.log(`✅ Found ${existingDirs.length} coverage reports:`);
  existingDirs.forEach(dir => {
    console.log(`   - ${path.basename(dir)}`);
  });

  // Create reports directory
  if (!fs.existsSync(REPORTS_DIR)) {
    fs.mkdirSync(REPORTS_DIR, { recursive: true });
  }

  // Copy coverage files to merge directory
  const mergeDir = path.join(REPORTS_DIR, 'merge');
  if (!fs.existsSync(mergeDir)) {
    fs.mkdirSync(mergeDir, { recursive: true });
  }

  console.log('\n📋 Copying coverage files...');
  
  existingDirs.forEach((dir, index) => {
    const sourceFile = path.join(dir, 'coverage-final.json');
    const targetFile = path.join(mergeDir, `coverage-${index}.json`);
    
    fs.copyFileSync(sourceFile, targetFile);
    console.log(`   Copied: ${path.basename(dir)}/coverage-final.json`);
  });

  // Merge reports using nyc
  console.log('\n🔀 Merging coverage reports...');
  
  try {
    const mergeCommand = `npx nyc merge ${mergeDir} ${path.join(REPORTS_DIR, 'coverage-merged.json')}`;
    execSync(mergeCommand, { stdio: 'inherit' });
    console.log('✅ Coverage reports merged successfully');
  } catch (error) {
    console.error('❌ Failed to merge coverage reports:', error.message);
    process.exit(1);
  }

  // Generate combined report
  console.log('\n📊 Generating combined coverage report...');
  
  try {
    const reportCommand = `npx nyc report \
      --temp-dir ${mergeDir} \
      --reporter=text-summary \
      --reporter=html \
      --reporter=json \
      --reporter=lcov \
      --report-dir ${REPORTS_DIR}`;
    
    execSync(reportCommand, { stdio: 'inherit' });
    console.log('✅ Coverage report generated');
  } catch (error) {
    console.error('❌ Failed to generate coverage report:', error.message);
    process.exit(1);
  }

  // Parse and display summary
  displaySummary();

  // Cleanup
  console.log('\n🧹 Cleaning up temporary files...');
  fs.rmSync(mergeDir, { recursive: true, force: true });
  console.log('✅ Cleanup complete');
}

/**
 * Display coverage summary
 */
function displaySummary() {
  const summaryFile = path.join(REPORTS_DIR, 'coverage-summary.json');
  
  if (!fs.existsSync(summaryFile)) {
    console.warn('⚠️  Coverage summary not found');
    return;
  }

  console.log('\n' + '='.repeat(60));
  console.log('📈 COVERAGE SUMMARY');
  console.log('='.repeat(60));

  try {
    const summary = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
    const total = summary.total;

    if (total) {
      const formatPct = (pct) => pct.toFixed(2) + '%';
      const checkThreshold = (pct, threshold = 70) => pct >= threshold ? '✅' : '❌';

      console.log(`\nLines:       ${formatPct(total.lines.pct)} ${checkThreshold(total.lines.pct)}`);
      console.log(`Statements:  ${formatPct(total.statements.pct)} ${checkThreshold(total.statements.pct)}`);
      console.log(`Functions:   ${formatPct(total.functions.pct)} ${checkThreshold(total.functions.pct)}`);
      console.log(`Branches:    ${formatPct(total.branches.pct)} ${checkThreshold(total.branches.pct)}`);

      // Check if all thresholds are met
      const allPassed = 
        total.lines.pct >= 70 &&
        total.statements.pct >= 70 &&
        total.functions.pct >= 70 &&
        total.branches.pct >= 70;

      console.log('\n' + '='.repeat(60));
      if (allPassed) {
        console.log('✅ All coverage thresholds met (70%)');
      } else {
        console.log('❌ Some coverage thresholds not met');
        process.exitCode = 1;
      }
      console.log('='.repeat(60));
    }

    // Show per-file coverage for files below threshold
    console.log('\n📁 Files below 70% coverage:');
    let lowCoverageFiles = 0;
    
    Object.entries(summary).forEach(([file, data]) => {
      if (file !== 'total' && typeof data === 'object' && data.lines) {
        if (data.lines.pct < 70) {
          console.log(`   ${file}: ${formatPct(data.lines.pct)}`);
          lowCoverageFiles++;
        }
      }
    });

    if (lowCoverageFiles === 0) {
      console.log('   None - all files meet the threshold!');
    }

  } catch (error) {
    console.error('❌ Error parsing coverage summary:', error.message);
  }

  console.log('\n📂 Report locations:');
  console.log(`   HTML:  ${path.join(REPORTS_DIR, 'index.html')}`);
  console.log(`   LCOV:  ${path.join(REPORTS_DIR, 'lcov.info')}`);
  console.log(`   JSON:  ${summaryFile}`);
}

/**
 * Generate badge for README
 */
function generateBadge() {
  const summaryFile = path.join(REPORTS_DIR, 'coverage-summary.json');
  
  if (!fs.existsSync(summaryFile)) {
    return;
  }

  try {
    const summary = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
    const total = summary.total;

    if (total && total.lines) {
      const coverage = Math.round(total.lines.pct);
      let color = 'red';
      
      if (coverage >= 80) color = 'brightgreen';
      else if (coverage >= 70) color = 'green';
      else if (coverage >= 60) color = 'yellow';
      else if (coverage >= 50) color = 'orange';

      const badgeUrl = `https://img.shields.io/badge/coverage-${coverage}%25-${color}`;
      
      console.log('\n🏷️  Coverage Badge:');
      console.log(`   ${badgeUrl}`);
      
      // Save badge markdown
      const badgeMarkdown = `[![Coverage](${badgeUrl})](./testing/coverage/reports/index.html)`;
      fs.writeFileSync(path.join(REPORTS_DIR, 'badge.md'), badgeMarkdown);
      console.log('   Badge markdown saved to badge.md');
    }
  } catch (error) {
    console.error('❌ Error generating badge:', error.message);
  }
}

/**
 * Main function
 */
function main() {
  console.log('🚀 Coverage Report Merger\n');

  if (!checkNyc()) {
    process.exit(1);
  }

  mergeCoverageReports();
  generateBadge();

  console.log('\n✨ Done!');
}

// Run main function
main();
