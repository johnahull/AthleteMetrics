/**
 * Formula Service for Derived Metrics
 *
 * Provides safe formula validation and evaluation for calculating derived metric values
 * from source measurements. Uses mathjs for secure expression parsing without eval().
 */

import { create, all, ConfigOptions } from 'mathjs';

// Create a mathjs instance with limited functionality for security
const mathConfig: ConfigOptions = {
  number: 'number', // Use JavaScript numbers
  precision: 64,
};

const math = create(all, mathConfig);

// Restrict to safe functions only - no eval, no import, no system calls
const allowedFunctions = new Set([
  'sqrt', 'pow', 'abs', 'round', 'floor', 'ceil',
  'min', 'max', 'add', 'subtract', 'multiply', 'divide',
  // Allow basic arithmetic operators (handled by parser)
]);

export interface FormulaValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  referencedMetrics: string[];
}

/**
 * Validate a formula string
 *
 * @param formula - The formula to validate (e.g., "10 / fly10_time * 2.045")
 * @param availableMetrics - Array of valid metric codes that can be referenced
 * @returns Validation result with errors and referenced metrics
 */
export function validateFormula(
  formula: string,
  availableMetrics: string[]
): FormulaValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const referencedMetrics: string[] = [];

  // Check for empty formula
  if (!formula || formula.trim() === '') {
    errors.push('Formula cannot be empty');
    return { valid: false, errors, warnings, referencedMetrics };
  }

  // SECURITY FIX: Prevent DoS attacks via extremely long formulas
  const MAX_FORMULA_LENGTH = 1000;
  if (formula.length > MAX_FORMULA_LENGTH) {
    errors.push(`Formula exceeds maximum length of ${MAX_FORMULA_LENGTH} characters`);
    return { valid: false, errors, warnings, referencedMetrics };
  }

  try {
    // Parse the formula to check syntax
    const node = math.parse(formula);

    // Extract all variable names (metric references) and function calls
    const variables = new Set<string>();
    const functionsUsed = new Set<string>();
    const metricsInDenominator = new Set<string>();

    // TYPE SAFETY FIX: Add defensive checks for node structure
    node.traverse((node: any) => {
      // Defensive programming: check node exists and has type property
      if (!node || typeof node.type !== 'string') {
        return;
      }

      if (node.type === 'SymbolNode') {
        // Check if it's a variable (metric reference) or a function
        if (node.name && typeof node.name === 'string' && !math[node.name as keyof typeof math]) {
          // Not a built-in math function, treat as metric reference
          // CASE NORMALIZATION FIX: Store in lowercase for consistent matching
          variables.add(node.name.toLowerCase());
        }
      } else if (node.type === 'FunctionNode') {
        if (node.fn) {
          const fnName = typeof node.fn === 'string' ? node.fn : (node.fn.name || String(node.fn));
          functionsUsed.add(fnName);
        }
      } else if (node.type === 'OperatorNode' && (node.op === '/' || node.fn === 'divide')) {
        // Detect division operations and check if denominator contains a metric
        // This helps warn users about potential division-by-zero
        if (node.args && node.args[1]) {
          node.args[1].traverse((denominatorNode: any) => {
            if (denominatorNode?.type === 'SymbolNode' && denominatorNode.name) {
              const metricName = denominatorNode.name.toLowerCase();
              if (!math[denominatorNode.name as keyof typeof math]) {
                metricsInDenominator.add(metricName);
              }
            }
          });
        }
      }
    });

    // Check that all referenced metrics are available (case-insensitive)
    // Convert available metrics to lowercase for comparison
    const availableMetricsLower = new Set(availableMetrics.map(m => m.toLowerCase()));

    variables.forEach(varName => {
      if (!availableMetricsLower.has(varName)) {
        errors.push(`Unknown metric: ${varName}`);
      } else {
        referencedMetrics.push(varName);
      }
    });

    // Check that only allowed functions are used
    functionsUsed.forEach(fnName => {
      // Math.js built-in functions are generally safe, but we validate against our whitelist
      // Note: Basic operators (+, -, *, /) are handled by OperatorNode, not FunctionNode
      if (!allowedFunctions.has(fnName)) {
        // Check if it's a metric being called as a function (error)
        if (availableMetrics.includes(fnName)) {
          errors.push(`Metric "${fnName}" cannot be used as a function`);
        } else {
          errors.push(`Unsupported function: ${fnName}`);
        }
      }
    });

    // Warn about potential division-by-zero scenarios
    if (metricsInDenominator.size > 0) {
      const metricList = Array.from(metricsInDenominator).join(', ');
      warnings.push(
        `Formula divides by metric(s): ${metricList}. ` +
        `Ensure measurements for these metrics never contain zero values, ` +
        `or the calculation will fail and return null.`
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      referencedMetrics: Array.from(new Set(referencedMetrics)), // Remove duplicates
    };
  } catch (error) {
    errors.push(`Invalid formula syntax: ${(error as Error).message}`);
    return { valid: false, errors, warnings, referencedMetrics };
  }
}

/**
 * Evaluate a formula with provided source values
 *
 * @param formula - The formula to evaluate
 * @param sourceValues - Object mapping metric codes to their values
 * @returns Calculated result or null if evaluation fails or source values are missing
 */
export function evaluateFormula(
  formula: string,
  sourceValues: Record<string, number>
): number | null {
  try {
    // Normalize formula variable names to lowercase for case-insensitive matching
    // This ensures FLY10_TIME in formula matches fly10_time in sourceValues
    let normalizedFormula = formula;
    const node = math.parse(formula);

    // Collect variable names and their positions for replacement
    const variablesToReplace: Array<{ original: string; lowercase: string }> = [];
    node.traverse((node: any) => {
      if (!node || typeof node.type !== 'string') {
        return;
      }
      if (node.type === 'SymbolNode') {
        if (node.name && typeof node.name === 'string' && !math[node.name as keyof typeof math]) {
          const lowercase = node.name.toLowerCase();
          if (node.name !== lowercase) {
            variablesToReplace.push({ original: node.name, lowercase });
          }
        }
      }
    });

    // Replace uppercase variable names with lowercase in formula
    // Sort by length descending to avoid partial replacements
    variablesToReplace.sort((a, b) => b.original.length - a.original.length);
    for (const { original, lowercase } of variablesToReplace) {
      // Use word boundary regex to avoid partial matches
      const regex = new RegExp(`\\b${original}\\b`, 'g');
      normalizedFormula = normalizedFormula.replace(regex, lowercase);
    }

    // Re-parse the normalized formula
    const normalizedNode = math.parse(normalizedFormula);

    // Extract all variables needed from normalized formula
    const variables = new Set<string>();
    normalizedNode.traverse((node: any) => {
      if (!node || typeof node.type !== 'string') {
        return;
      }
      if (node.type === 'SymbolNode') {
        if (node.name && typeof node.name === 'string' && !math[node.name as keyof typeof math]) {
          variables.add(node.name);
        }
      }
    });

    // Normalize sourceValues keys to lowercase for case-insensitive matching
    const normalizedSourceValues: Record<string, number> = {};
    Object.keys(sourceValues).forEach(key => {
      normalizedSourceValues[key.toLowerCase()] = sourceValues[key];
    });

    // Check that all required variables are provided
    for (const varName of variables) {
      if (normalizedSourceValues[varName] === undefined || normalizedSourceValues[varName] === null) {
        // Missing source value
        return null;
      }
    }

    // Evaluate the normalized formula using normalized source values
    const result = normalizedNode.compile().evaluate(normalizedSourceValues);

    // Handle special cases
    if (typeof result !== 'number' || isNaN(result)) {
      return null;
    }

    // CRITICAL FIX: Reject Infinity and -Infinity (from division by zero)
    // Infinity values corrupt the database and break analytics
    if (!isFinite(result)) {
      return null;
    }

    return result;
  } catch (error) {
    // Invalid formula or evaluation error
    return null;
  }
}

/**
 * Detect circular dependencies in metric definitions using DFS
 *
 * @param metrics - Array of metric definitions with their dependencies
 * @returns Object indicating if circular dependency exists and the cycle path
 */
export function detectCircularDependencies(
  metrics: Array<{ code: string; dependentMetrics?: string[] }>
): { hasCircular: boolean; cycle?: string[] } {
  // Build adjacency list
  const graph = new Map<string, string[]>();
  metrics.forEach(metric => {
    graph.set(metric.code, metric.dependentMetrics || []);
  });

  // Track visited nodes and recursion stack for DFS
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const path: string[] = [];

  /**
   * DFS helper to detect cycles
   */
  function dfs(node: string): boolean {
    visited.add(node);
    recStack.add(node);
    path.push(node);

    const neighbors = graph.get(node) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) {
          return true; // Cycle found
        }
      } else if (recStack.has(neighbor)) {
        // Found a back edge - cycle detected
        path.push(neighbor); // Add the node that completes the cycle
        return true;
      }
    }

    recStack.delete(node);
    path.pop();
    return false;
  }

  // Run DFS from each unvisited node
  for (const metric of metrics) {
    if (!visited.has(metric.code)) {
      path.length = 0; // Reset path for each component
      if (dfs(metric.code)) {
        // Extract the cycle from the path
        const cycleStart = path[path.length - 1];
        const cycleStartIndex = path.indexOf(cycleStart);
        const cycle = path.slice(cycleStartIndex);
        return { hasCircular: true, cycle };
      }
    }
  }

  return { hasCircular: false };
}
