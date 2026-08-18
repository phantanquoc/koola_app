export interface TranslationProvider {
  readonly name: string;
  isConfigured(): boolean;
  translate(
    text: string,
    targetLang: string,
  ): Promise<{ translatedText: string; sourceLang: string }>;
}
