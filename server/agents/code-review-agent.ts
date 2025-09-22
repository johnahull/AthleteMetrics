/**
 * Code Review Agent - Provides automated code analysis and review capabilities
 * Designed to complement the existing Claude GitHub bot with real-time analysis
 */

import { BaseAgent, AgentResult, AgentHealth, AgentContext } from '@shared/agents/types';
import {
  CodeReviewAgent as ICodeReviewAgent,
  FileAnalysis,
  PRAnalysis,
  SecurityScanResult,
  PerformanceReport,
  StyleReport,
  ReviewSummary,
  FileChange,
  AnalysisOptions,
  PRAnalysisOptions,
  StyleRules,
  CodeIssue,
  CodeMetrics,
  ComplexityMetrics
} from '@shared/agents/contracts';
import * as ts from 'typescript';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  ATHLETE_METRICS_RULES,
  SECURITY_PATTERNS,
  PERFORMANCE_THRESHOLDS,
  isRuleApplicableToFile,
  getCriticalRules,
  type ProjectRule
} from './code-review-rules';

export class CodeReviewAgent implements ICodeReviewAgent {
  public readonly name = 'CodeReviewAgent';
  public readonly version = '1.0.0';
  public readonly dependencies = ['SecurityAgent'];

  private initialized = false;
  private tsProgram: ts.Program | null = null;
  private projectConfig: any = null;

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Load TypeScript project configuration
      await this.loadProjectConfig();

      console.log(`${this.name} initialized successfully`);
      this.initialized = true;
    } catch (error) {
      console.error(`Failed to initialize ${this.name}:`, error);
      throw error;
    }
  }

  async shutdown(): Promise<void> {
    this.initialized = false;
    this.tsProgram = null;
    this.projectConfig = null;
    console.log(`${this.name} shut down`);
  }

  async healthCheck(): Promise<AgentHealth> {
    if (!this.initialized) {
      return {
        status: 'unhealthy',
        message: 'Agent not initialized',
        lastCheck: new Date()
      };
    }

    try {
      // Basic health check - verify TypeScript compilation works
      const testCode = 'const test: string = "hello";';
      const sourceFile = ts.createSourceFile(
        'test.ts',
        testCode,
        ts.ScriptTarget.ES2020,
        true
      );

      if (!sourceFile) {
        throw new Error('Failed to create TypeScript source file');
      }

      return {
        status: 'healthy',
        message: 'All systems operational',
        lastCheck: new Date()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        message: `Health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        lastCheck: new Date()
      };
    }
  }

  async analyzeFile(
    filePath: string,
    content: string,
    options: AnalysisOptions = {}
  ): Promise<AgentResult<FileAnalysis>> {
    try {
      const fileExtension = path.extname(filePath);
      const fileType = this.getFileType(fileExtension);

      // Create TypeScript source file for analysis
      const sourceFile = ts.createSourceFile(
        filePath,
        content,
        ts.ScriptTarget.ES2020,
        true
      );

      // Perform core analysis
      const issues: CodeIssue[] = [];
      const metrics = await this.calculateMetrics(sourceFile, content);
      const complexity = await this.calculateComplexity(sourceFile);

      // TypeScript-specific analysis
      if (fileType === 'typescript' || fileType === 'javascript') {
        issues.push(...await this.analyzeTypeScriptFile(sourceFile, options));
      }

      // Apply AthleteMetrics-specific rules
      issues.push(...await this.applyProjectRules(filePath, content, options));

      // Security analysis
      if (options.includeSecurityScan) {
        const securityResult = await this.scanSecurity(content, fileType);
        if (securityResult.success && securityResult.data) {
          issues.push(...securityResult.data.vulnerabilities.map(vuln => ({
            id: `security-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'security' as const,
            severity: vuln.severity,
            line: vuln.line,
            message: vuln.description,
            description: vuln.description,
            suggestion: vuln.recommendation,
            rule: vuln.type
          })));
        }
      }

      // Performance analysis
      if (options.includePerformanceCheck) {
        const perfResult = await this.checkPerformance(content, fileType);
        if (perfResult.success && perfResult.data) {
          issues.push(...perfResult.data.issues.map(issue => ({
            id: `perf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'performance' as const,
            severity: issue.severity,
            line: issue.line,
            message: issue.description,
            description: issue.impact,
            suggestion: issue.suggestion,
            rule: issue.type
          })));
        }
      }

      // Style validation
      if (options.includeStyleValidation) {
        const styleResult = await this.validateCodeStyle(content, fileType);
        if (styleResult.success && styleResult.data) {
          issues.push(...styleResult.data.violations.map(violation => ({
            id: `style-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            type: 'style' as const,
            severity: 'low' as const,
            line: violation.line,
            column: violation.column,
            message: violation.message,
            description: violation.message,
            suggestion: violation.suggestion,
            rule: violation.rule,
            fixable: violation.fixable
          })));
        }
      }

      const suggestions = this.generateSuggestions(issues, metrics, complexity);
      const summary = this.generateFileSummary(filePath, issues, metrics);

      const analysis: FileAnalysis = {
        filePath,
        fileType,
        summary,
        issues,
        metrics,
        suggestions,
        complexity
      };

      return this.createSuccessResult(analysis);
    } catch (error) {
      return this.createErrorResult(
        `File analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'FILE_ANALYSIS_FAILED'
      );
    }
  }

  async analyzePullRequest(
    files: FileChange[],
    options: PRAnalysisOptions = {}
  ): Promise<AgentResult<PRAnalysis>> {
    try {
      const maxFiles = options.maxFilesToAnalyze || 50;
      const filesToAnalyze = files.slice(0, maxFiles);

      // Analyze each file
      const fileAnalyses: FileAnalysis[] = [];
      for (const file of filesToAnalyze) {
        if (file.changeType !== 'deleted') {
          const analysisResult = await this.analyzeFile(file.path, file.content, options);
          if (analysisResult.success && analysisResult.data) {
            fileAnalyses.push(analysisResult.data);
          }
        }
      }

      // Calculate PR overview
      const linesAdded = files.reduce((sum, file) => {
        if (file.changeType === 'added' || file.changeType === 'modified') {
          return sum + file.content.split('\n').length;
        }
        return sum;
      }, 0);

      const linesRemoved = files.reduce((sum, file) => {
        if (file.changeType === 'deleted' || (file.changeType === 'modified' && file.previousContent)) {
          return sum + (file.previousContent?.split('\n').length || 0);
        }
        return sum;
      }, 0);

      const totalComplexity = fileAnalyses.reduce((sum, analysis) =>
        sum + analysis.complexity.cyclomaticComplexity, 0
      );

      const allIssues = fileAnalyses.flatMap(analysis => analysis.issues);
      const criticalIssues = allIssues.filter(issue => issue.severity === 'critical');
      const highIssues = allIssues.filter(issue => issue.severity === 'high');

      const riskLevel = this.calculateRiskLevel(criticalIssues.length, highIssues.length, totalComplexity);

      // Find cross-file issues
      const crossFileIssues = this.findCrossFileIssues(fileAnalyses);

      // Generate summary
      const summaryResult = await this.generateSummary(fileAnalyses);
      const summary = summaryResult.success && summaryResult.data ? summaryResult.data : {
        overallScore: 0,
        riskLevel: 'high' as const,
        keyFindings: [],
        recommendations: [],
        blockers: [],
        mustFix: [],
        shouldFix: [],
        suggestions: [],
        estimatedReviewTime: 0
      };

      const prAnalysis: PRAnalysis = {
        overview: {
          filesChanged: files.length,
          linesAdded,
          linesRemoved,
          complexity: totalComplexity,
          riskLevel
        },
        fileAnalyses,
        crossFileIssues,
        summary
      };

      return this.createSuccessResult(prAnalysis);
    } catch (error) {
      return this.createErrorResult(
        `PR analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'PR_ANALYSIS_FAILED'
      );
    }
  }

  async scanSecurity(content: string, fileType: string): Promise<AgentResult<SecurityScanResult>> {
    try {
      const vulnerabilities: Array<{
        type: string;
        severity: 'low' | 'medium' | 'high' | 'critical';
        line: number;
        description: string;
        cwe?: string;
        recommendation: string;
      }> = [];
      const lines = content.split('\n');

      // Basic security pattern matching
      const securityPatterns = [
        {
          pattern: /password\s*=\s*['"]/i,
          type: 'Hardcoded Password',
          severity: 'critical' as const,
          cwe: 'CWE-798'
        },
        {
          pattern: /api[_-]?key\s*=\s*['"]/i,
          type: 'Hardcoded API Key',
          severity: 'critical' as const,
          cwe: 'CWE-798'
        },
        {
          pattern: /eval\s*\(/,
          type: 'Code Injection Risk',
          severity: 'high' as const,
          cwe: 'CWE-94'
        },
        {
          pattern: /innerHTML\s*=/,
          type: 'XSS Risk',
          severity: 'medium' as const,
          cwe: 'CWE-79'
        },
        {
          pattern: /document\.write\s*\(/,
          type: 'XSS Risk',
          severity: 'medium' as const,
          cwe: 'CWE-79'
        },
        // Add AthleteMetrics-specific security patterns
        ...SECURITY_PATTERNS.map(p => ({
          pattern: p.pattern,
          type: p.name,
          severity: p.severity,
          cwe: 'CWE-200' // Information Exposure
        }))
      ];

      lines.forEach((line, index) => {
        securityPatterns.forEach(pattern => {
          if (pattern.pattern.test(line)) {
            vulnerabilities.push({
              type: pattern.type,
              severity: pattern.severity,
              line: index + 1,
              description: `${pattern.type} detected in code`,
              cwe: pattern.cwe,
              recommendation: `Remove or secure ${pattern.type.toLowerCase()}`
            });
          }
        });
      });

      const securityScore = Math.max(0, 100 - (vulnerabilities.length * 10));
      const recommendations = this.generateSecurityRecommendations(vulnerabilities);

      return this.createSuccessResult({
        vulnerabilities,
        securityScore,
        recommendations
      });
    } catch (error) {
      return this.createErrorResult(
        `Security scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SECURITY_SCAN_FAILED'
      );
    }
  }

  async checkPerformance(content: string, fileType: string): Promise<AgentResult<PerformanceReport>> {
    try {
      const issues: Array<{
        type: string;
        severity: 'low' | 'medium' | 'high';
        line: number;
        description: string;
        impact: string;
        suggestion: string;
      }> = [];
      const lines = content.split('\n');

      // Performance pattern matching
      const performancePatterns = [
        {
          pattern: /for\s*\([^}]+\{[^}]*for\s*\(/,
          type: 'Nested Loop',
          severity: 'medium' as const,
          impact: 'O(n²) time complexity'
        },
        {
          pattern: /console\.log\s*\(/,
          type: 'Console Logging',
          severity: 'low' as const,
          impact: 'Performance overhead in production'
        },
        {
          pattern: /JSON\.parse\s*\(\s*JSON\.stringify/,
          type: 'Inefficient Deep Clone',
          severity: 'medium' as const,
          impact: 'Unnecessary serialization overhead'
        }
      ];

      lines.forEach((line, index) => {
        performancePatterns.forEach(pattern => {
          if (pattern.pattern.test(line)) {
            issues.push({
              type: pattern.type,
              severity: pattern.severity,
              line: index + 1,
              description: `${pattern.type} detected`,
              impact: pattern.impact,
              suggestion: this.getPerformanceSuggestion(pattern.type)
            });
          }
        });
      });

      const score = Math.max(0, 100 - (issues.length * 15));
      const suggestions = this.generatePerformanceSuggestions(issues);

      return this.createSuccessResult({
        issues,
        score,
        suggestions
      });
    } catch (error) {
      return this.createErrorResult(
        `Performance check failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'PERFORMANCE_CHECK_FAILED'
      );
    }
  }

  async validateCodeStyle(
    content: string,
    fileType: string,
    rules: StyleRules = {}
  ): Promise<AgentResult<StyleReport>> {
    try {
      const violations: Array<{
        rule: string;
        line: number;
        column?: number;
        message: string;
        fixable: boolean;
        suggestion?: string;
      }> = [];
      const lines = content.split('\n');

      const defaultRules = {
        maxLineLength: 120,
        indentation: 'spaces' as const,
        indentSize: 2,
        semicolons: true,
        quotes: 'single' as const,
        trailingComma: true
      };

      const effectiveRules = { ...defaultRules, ...rules };

      lines.forEach((line, index) => {
        // Line length check
        if (line.length > effectiveRules.maxLineLength) {
          violations.push({
            rule: 'max-line-length',
            line: index + 1,
            message: `Line too long (${line.length}/${effectiveRules.maxLineLength})`,
            fixable: false
          });
        }

        // Indentation check
        if (effectiveRules.indentation === 'spaces' && line.match(/^\t/)) {
          violations.push({
            rule: 'indent',
            line: index + 1,
            message: 'Use spaces for indentation',
            fixable: true,
            suggestion: 'Replace tabs with spaces'
          });
        }

        // Semicolon check (simple)
        if (effectiveRules.semicolons && line.trim().match(/^(const|let|var|return)\s+.*[^;]$/)) {
          violations.push({
            rule: 'semicolon',
            line: index + 1,
            message: 'Missing semicolon',
            fixable: true,
            suggestion: 'Add semicolon at end of statement'
          });
        }
      });

      const score = Math.max(0, 100 - (violations.length * 5));
      const summary = `${violations.length} style violations found`;

      return this.createSuccessResult({
        violations,
        score,
        summary
      });
    } catch (error) {
      return this.createErrorResult(
        `Style validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'STYLE_VALIDATION_FAILED'
      );
    }
  }

  async generateSummary(analyses: FileAnalysis[]): Promise<AgentResult<ReviewSummary>> {
    try {
      const allIssues = analyses.flatMap(analysis => analysis.issues);
      const blockers = allIssues.filter(issue => issue.severity === 'critical');
      const mustFix = allIssues.filter(issue => issue.severity === 'high');
      const shouldFix = allIssues.filter(issue => issue.severity === 'medium');

      const totalComplexity = analyses.reduce((sum, analysis) =>
        sum + analysis.complexity.cyclomaticComplexity, 0
      );

      const overallScore = this.calculateOverallScore(allIssues, totalComplexity);
      const riskLevel = this.calculateRiskLevel(blockers.length, mustFix.length, totalComplexity);

      const keyFindings = this.extractKeyFindings(allIssues);
      const recommendations = this.generateRecommendations(allIssues, analyses);
      const suggestions = this.generateGeneralSuggestions(analyses);

      const estimatedReviewTime = this.estimateReviewTime(analyses.length, allIssues.length);

      const summary: ReviewSummary = {
        overallScore,
        riskLevel,
        keyFindings,
        recommendations,
        blockers,
        mustFix,
        shouldFix,
        suggestions,
        estimatedReviewTime
      };

      return this.createSuccessResult(summary);
    } catch (error) {
      return this.createErrorResult(
        `Summary generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SUMMARY_GENERATION_FAILED'
      );
    }
  }

  // Private helper methods

  private async applyProjectRules(
    filePath: string,
    content: string,
    options: AnalysisOptions
  ): Promise<CodeIssue[]> {
    const issues: CodeIssue[] = [];
    const lines = content.split('\n');

    // Filter applicable rules
    const applicableRules = ATHLETE_METRICS_RULES.filter(rule =>
      isRuleApplicableToFile(rule, filePath)
    );

    // Apply each rule
    for (const rule of applicableRules) {
      lines.forEach((line, index) => {
        if (rule.pattern.test(line)) {
          issues.push({
            id: `project-${rule.id}-${index}`,
            type: this.mapCategoryToType(rule.category),
            severity: rule.severity,
            line: index + 1,
            message: rule.description,
            description: rule.description,
            suggestion: rule.suggestion,
            rule: rule.id,
            fixable: rule.autoFixable
          });
        }
      });
    }

    return issues;
  }

  private mapCategoryToType(category: string): 'security' | 'performance' | 'style' | 'logic' | 'typing' {
    const mapping: Record<string, 'security' | 'performance' | 'style' | 'logic' | 'typing'> = {
      'security': 'security',
      'performance': 'performance',
      'architecture': 'logic',
      'data': 'logic',
      'ui': 'style'
    };
    return mapping[category] || 'logic';
  }

  private async loadProjectConfig(): Promise<void> {
    try {
      // Try to load tsconfig.json
      const tsconfigPath = path.join(process.cwd(), 'tsconfig.json');
      const tsconfigContent = await fs.readFile(tsconfigPath, 'utf-8');
      this.projectConfig = JSON.parse(tsconfigContent);
    } catch (error) {
      // Use default configuration if tsconfig.json not found
      this.projectConfig = {
        compilerOptions: {
          target: 'ES2020',
          module: 'commonjs',
          strict: true
        }
      };
    }
  }

  private getFileType(extension: string): string {
    const typeMap: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.json': 'json',
      '.md': 'markdown',
      '.css': 'css',
      '.scss': 'scss',
      '.html': 'html'
    };
    return typeMap[extension] || 'unknown';
  }

  private async analyzeTypeScriptFile(
    sourceFile: ts.SourceFile,
    options: AnalysisOptions
  ): Promise<CodeIssue[]> {
    const issues: CodeIssue[] = [];

    const visit = (node: ts.Node) => {
      // Check for any type
      if (ts.isTypeReferenceNode(node) && node.typeName.getText() === 'any') {
        issues.push({
          id: `any-type-${node.getStart()}`,
          type: 'typing',
          severity: 'medium',
          line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          message: 'Use of "any" type reduces type safety',
          description: 'Consider using more specific types',
          suggestion: 'Replace any with specific type',
          rule: 'no-any'
        });
      }

      // Check for unused variables
      if (ts.isVariableDeclaration(node) && node.name && ts.isIdentifier(node.name)) {
        const variableName = node.name.text;
        if (variableName.startsWith('_') || !this.isVariableUsed(sourceFile, variableName, node)) {
          issues.push({
            id: `unused-var-${node.getStart()}`,
            type: 'logic',
            severity: 'low',
            line: sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            message: `Unused variable: ${variableName}`,
            description: 'Variable is declared but never used',
            suggestion: 'Remove unused variable or prefix with underscore',
            rule: 'no-unused-vars'
          });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(sourceFile);
    return issues;
  }

  private isVariableUsed(sourceFile: ts.SourceFile, variableName: string, declaration: ts.Node): boolean {
    // Simple check - in real implementation, would use TypeScript compiler API
    const sourceText = sourceFile.getFullText();
    const declarationStart = declaration.getStart();
    const afterDeclaration = sourceText.slice(declarationStart + declaration.getWidth());
    return afterDeclaration.includes(variableName);
  }

  private async calculateMetrics(sourceFile: ts.SourceFile, content: string): Promise<CodeMetrics> {
    const lines = content.split('\n');
    const linesOfCode = lines.filter(line => line.trim() && !line.trim().startsWith('//')).length;

    // Basic complexity calculation
    const complexity = this.calculateBasicComplexity(content);

    // Maintainability index (simplified)
    const maintainabilityIndex = Math.max(0, 100 - (complexity * 2) - (linesOfCode / 10));

    return {
      linesOfCode,
      complexity,
      maintainabilityIndex,
      technicalDebt: this.calculateTechnicalDebt(complexity, linesOfCode)
    };
  }

  private async calculateComplexity(sourceFile: ts.SourceFile): Promise<ComplexityMetrics> {
    let cyclomaticComplexity = 1; // Base complexity
    let functionCount = 0;
    let nestingDepth = 0;
    let maxNesting = 0;
    let currentNesting = 0;

    const visit = (node: ts.Node) => {
      currentNesting++;
      maxNesting = Math.max(maxNesting, currentNesting);

      // Count complexity-increasing constructs
      if (ts.isIfStatement(node) || ts.isWhileStatement(node) ||
          ts.isForStatement(node) || ts.isDoStatement(node) ||
          ts.isSwitchStatement(node) || ts.isConditionalExpression(node)) {
        cyclomaticComplexity++;
      }

      if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) ||
          ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
        functionCount++;
      }

      ts.forEachChild(node, visit);
      currentNesting--;
    };

    visit(sourceFile);

    return {
      cyclomaticComplexity,
      cognitiveComplexity: cyclomaticComplexity * 1.2, // Simplified
      nestingDepth: maxNesting,
      functionCount
    };
  }

  private calculateBasicComplexity(content: string): number {
    const complexityKeywords = ['if', 'else', 'while', 'for', 'switch', 'case', 'catch', '&&', '||'];
    return complexityKeywords.reduce((count, keyword) => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'g');
      const matches = content.match(regex);
      return count + (matches ? matches.length : 0);
    }, 1);
  }

  private calculateTechnicalDebt(complexity: number, linesOfCode: number): string {
    const debtHours = (complexity * 0.1) + (linesOfCode / 100);
    if (debtHours < 1) return 'Low';
    if (debtHours < 4) return 'Medium';
    if (debtHours < 8) return 'High';
    return 'Critical';
  }

  private generateSuggestions(issues: CodeIssue[], metrics: CodeMetrics, complexity: ComplexityMetrics): string[] {
    const suggestions: string[] = [];

    // Use project-specific thresholds
    if (complexity.cyclomaticComplexity > PERFORMANCE_THRESHOLDS.maxComplexity) {
      suggestions.push('Consider breaking down complex functions into smaller, more manageable pieces');
    }

    if (metrics.linesOfCode > PERFORMANCE_THRESHOLDS.maxFileLines) {
      suggestions.push('File is quite large - consider splitting into multiple modules');
    }

    const securityIssues = issues.filter(issue => issue.type === 'security');
    if (securityIssues.length > 0) {
      suggestions.push('Address security vulnerabilities before deployment');
    }

    const criticalIssues = issues.filter(issue => issue.severity === 'critical');
    if (criticalIssues.length > 0) {
      suggestions.push('Critical issues found - these must be resolved before deployment');
    }

    // AthleteMetrics-specific suggestions
    const databaseIssues = issues.filter(issue => issue.rule?.includes('organization') || issue.rule?.includes('drizzle'));
    if (databaseIssues.length > 0) {
      suggestions.push('Follow AthleteMetrics database patterns for consistency and security');
    }

    return suggestions;
  }

  private generateFileSummary(filePath: string, issues: CodeIssue[], metrics: CodeMetrics): string {
    const criticalIssues = issues.filter(issue => issue.severity === 'critical').length;
    const highIssues = issues.filter(issue => issue.severity === 'high').length;

    if (criticalIssues > 0) {
      return `File has ${criticalIssues} critical issues that must be addressed`;
    }
    if (highIssues > 0) {
      return `File has ${highIssues} high-priority issues to review`;
    }
    if (issues.length === 0) {
      return 'File looks good with no issues found';
    }
    return `File has ${issues.length} minor issues for consideration`;
  }

  private calculateRiskLevel(criticalCount: number, highCount: number, complexity: number): 'low' | 'medium' | 'high' | 'critical' {
    if (criticalCount > 0) return 'critical';
    if (highCount > 2 || complexity > 50) return 'high';
    if (highCount > 0 || complexity > 20) return 'medium';
    return 'low';
  }

  private findCrossFileIssues(analyses: FileAnalysis[]): CodeIssue[] {
    // Simplified - in real implementation would check for import/export issues, naming conflicts, etc.
    return [];
  }

  private calculateOverallScore(issues: CodeIssue[], complexity: number): number {
    const criticalPenalty = issues.filter(i => i.severity === 'critical').length * 25;
    const highPenalty = issues.filter(i => i.severity === 'high').length * 15;
    const mediumPenalty = issues.filter(i => i.severity === 'medium').length * 10;
    const lowPenalty = issues.filter(i => i.severity === 'low').length * 5;
    const complexityPenalty = Math.max(0, complexity - 10) * 2;

    return Math.max(0, 100 - criticalPenalty - highPenalty - mediumPenalty - lowPenalty - complexityPenalty);
  }

  private extractKeyFindings(issues: CodeIssue[]): string[] {
    const findings: string[] = [];

    const criticalIssues = issues.filter(i => i.severity === 'critical');
    if (criticalIssues.length > 0) {
      findings.push(`${criticalIssues.length} critical security/type issues found`);
    }

    const securityIssues = issues.filter(i => i.type === 'security');
    if (securityIssues.length > 0) {
      findings.push(`${securityIssues.length} security vulnerabilities detected`);
    }

    return findings;
  }

  private generateRecommendations(issues: CodeIssue[], analyses: FileAnalysis[]): string[] {
    const recommendations: string[] = [];

    if (issues.some(i => i.type === 'security')) {
      recommendations.push('Run security audit before deployment');
    }

    if (analyses.some(a => a.complexity.cyclomaticComplexity > 15)) {
      recommendations.push('Refactor complex functions to improve maintainability');
    }

    return recommendations;
  }

  private generateGeneralSuggestions(analyses: FileAnalysis[]): string[] {
    return [
      'Add unit tests for new functionality',
      'Update documentation for API changes',
      'Consider performance impact of changes'
    ];
  }

  private estimateReviewTime(fileCount: number, issueCount: number): number {
    // Base time + file complexity + issue resolution time
    return Math.ceil(10 + (fileCount * 2) + (issueCount * 1.5));
  }

  private generateSecurityRecommendations(vulnerabilities: any[]): string[] {
    const recommendations: string[] = [];

    if (vulnerabilities.some(v => v.type.includes('Password'))) {
      recommendations.push('Use environment variables for sensitive data');
    }

    if (vulnerabilities.some(v => v.type.includes('XSS'))) {
      recommendations.push('Sanitize user inputs and use secure DOM manipulation');
    }

    return recommendations;
  }

  private generatePerformanceSuggestions(issues: any[]): string[] {
    const suggestions: string[] = [];

    if (issues.some(i => i.type === 'Nested Loop')) {
      suggestions.push('Consider using more efficient algorithms or data structures');
    }

    if (issues.some(i => i.type === 'Console Logging')) {
      suggestions.push('Remove console.log statements in production code');
    }

    return suggestions;
  }

  private getPerformanceSuggestion(type: string): string {
    const suggestions: Record<string, string> = {
      'Nested Loop': 'Consider using hash maps or other O(1) lookup structures',
      'Console Logging': 'Remove or use proper logging framework',
      'Inefficient Deep Clone': 'Use library like lodash.cloneDeep or structured cloning'
    };
    return suggestions[type] || 'Consider optimization';
  }

  private createSuccessResult<T>(data: T): AgentResult<T> {
    return {
      success: true,
      data,
      metadata: {
        executionTime: Date.now(),
        agentVersion: this.version,
        dependencies: this.dependencies
      }
    };
  }

  private createErrorResult(message: string, code: string): AgentResult<any> {
    return {
      success: false,
      error: {
        code,
        message,
        retryable: false
      },
      metadata: {
        executionTime: Date.now(),
        agentVersion: this.version,
        dependencies: this.dependencies
      }
    };
  }
}