export function helmValue(_chartName: string, resourceName: string, fieldName: string): string {
  return `{{ .Values.${resourceName}.${fieldName} }}`
}

export function helmInclude(chartName: string, templateName: string, indent: number): string {
  return `{{- include "${chartName}.${templateName}" . | nindent ${indent} }}`
}

export function helmIf(condition: string): string {
  return `{{- if ${condition} }}`
}

export function helmEnd(): string {
  return `{{- end }}`
}

export function helmRange(variable: string, collection: string): string {
  return `{{- range ${variable} := ${collection} }}`
}

export function helmDefault(value: string, defaultVal: string): string {
  return `{{ ${value} | default "${defaultVal}" }}`
}

export function helmQuote(value: string): string {
  return `{{ ${value} | quote }}`
}

export function indent(text: string, spaces: number): string {
  const pad = ' '.repeat(spaces)
  return text
    .split('\n')
    .map((line) => (line.trim() ? `${pad}${line}` : line))
    .join('\n')
}

export function toYamlKey(str: string): string {
  return str
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase()
}
