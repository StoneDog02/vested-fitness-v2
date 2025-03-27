export class PDFProcessingError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "PDF_LOAD_ERROR"
      | "PDF_CONVERSION_ERROR"
      | "API_ERROR"
      | "PARSING_ERROR"
      | "INVALID_RESPONSE",
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "PDFProcessingError";
  }
}
