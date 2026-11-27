import { registerHooks } from 'node:module';

/**
 * Append .ts to bare relative imports for our TypeScript scripts.
 * Never rewrite node_modules (e.g. @supabase/functions-js require('./FunctionsClient')).
 */
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
      const parent = context.parentURL ?? '';
      if (/[/\\]node_modules[/\\]/.test(parent)) {
        return nextResolve(specifier, context);
      }
      return nextResolve(`${specifier}.ts`, context);
    }
    return nextResolve(specifier, context);
  },
});
