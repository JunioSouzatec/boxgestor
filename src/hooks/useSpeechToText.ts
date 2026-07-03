import { useCallback, useEffect, useRef, useState } from 'react'

interface SpeechRecognitionResultList {
  readonly length: number
  [index: number]: { readonly [index: number]: { transcript: string } }
}

interface SpeechRecognitionEventLike {
  results: SpeechRecognitionResultList
}

interface SpeechRecognitionErrorEventLike {
  error: string
}

interface SpeechRecognitionLike {
  lang: string
  continuous: boolean
  interimResults: boolean
  maxAlternatives: number
  onstart: (() => void) | null
  onend: (() => void) | null
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null
  onresult: ((event: SpeechRecognitionEventLike) => void) | null
  start(): void
  stop(): void
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike

function obterSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function navegadorSuportaDitadoVoz(): boolean {
  return obterSpeechRecognition() != null
}

interface UseSpeechToTextOptions {
  idioma?: string
  onTranscricao?: (texto: string) => void
}

export function useSpeechToText({ idioma = 'pt-BR', onTranscricao }: UseSpeechToTextOptions = {}) {
  const [ouvindo, setOuvindo] = useState(false)
  const [suportado] = useState(() => navegadorSuportaDitadoVoz())
  const [erro, setErro] = useState<string | null>(null)
  const [ultimaTranscricao, setUltimaTranscricao] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  const parar = useCallback(() => {
    recognitionRef.current?.stop()
    recognitionRef.current = null
    setOuvindo(false)
  }, [])

  const iniciar = useCallback(() => {
    const Ctor = obterSpeechRecognition()
    if (!Ctor) {
      setErro('Este navegador não suporta ditado por voz.')
      return
    }

    setErro(null)
    setUltimaTranscricao(null)

    const recognition = new Ctor()
    recognition.lang = idioma
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1

    recognition.onstart = () => setOuvindo(true)
    recognition.onend = () => {
      setOuvindo(false)
      recognitionRef.current = null
    }
    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      setOuvindo(false)
      recognitionRef.current = null
      if (event.error === 'not-allowed') {
        setErro('Permissão de microfone negada.')
      } else if (event.error !== 'aborted') {
        setErro('Não foi possível capturar a voz. Tente novamente.')
      }
    }
    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      const texto = event.results[0]?.[0]?.transcript?.trim()
      if (!texto) return
      setUltimaTranscricao(texto)
      onTranscricao?.(texto)
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
    } catch {
      setErro('Não foi possível iniciar o ditado por voz.')
      setOuvindo(false)
    }
  }, [idioma, onTranscricao])

  const alternar = useCallback(() => {
    if (ouvindo) {
      parar()
    } else {
      iniciar()
    }
  }, [iniciar, ouvindo, parar])

  useEffect(() => () => parar(), [parar])

  return {
    suportado,
    ouvindo,
    erro,
    ultimaTranscricao,
    iniciar,
    parar,
    alternar,
  }
}
