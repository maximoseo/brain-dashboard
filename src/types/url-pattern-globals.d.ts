declare global {
  type URLPatternInput = string | URLPatternInit;

  interface URLPatternOptions {
    ignoreCase?: boolean;
  }
}

export {};
