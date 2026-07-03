import { useCallback, useEffect, useRef, useState } from 'react'
import { navegadorSuportaDitadoVoz } from '@/hooks/useSpeechToText'

interface SpeechRecognitionResultList {
  readonly length: number
  [index: number]: {
    readonly length: number
    readonly isFinal?: boolean
    readonly [index: number]: { transcript: string }
  }
}

interface SpeechRecognitionEventLike {
  resultIndex: number
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
  abort(): void
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

interface UseSpeechToTextContinuoOptions {
  idioma?: string
}

export function useSpeechToTextContinuo({ idioma = 'pt-BR' }: UseSpeechToTextContinuoOptions = {}) {
  const [suportado] = useState(() => navegadorSuportaDitadoVoz())
  const [ouvindo, setOuvindo] = useState(false)
  const [transcricao, setTranscricao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const transcricaoRef = useRef('')
  const textoInterimRef = useRef('')

  const commitTranscricao = useCallback(() => {
    if (textoInterimRef.current) {
      transcricaoRef.current = transcricaoRef.current
        ? `${transcricaoRef.current} ${textoInterimRef.current}`.trim()
        : textoInterimRef.current.trim()
      textoInterimRef.current = ''
      setTranscricao(transcricaoRef.current)
    }
    return transcricaoRef.current
  }, [])

  const parar = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  const abortar = useCallback(() => {
    recognitionRef.current?.abort()
    recognitionRef.current = null
    setOuvindo(false)
  }, [])

  const limpar = useCallback(() => {
    transcricaoRef.current = ''
    textoInterimRef.current = ''
    setTranscricao('')
    setErro(null)
  }, [])

  const iniciar = useCallback(() => {
    const Ctor = obterSpeechRecognition()
    if (!Ctor) {
      setErro('Este navegador não suporta ditado por voz. Use a digitação manual.')
      return
    }

    setErro(null)

    const recognition = new Ctor()
    recognition.lang = idioma
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onstart = () => setOuvindo(true)
    recognition.onend = () => {
      if (textoInterimRef.current) {
        transcricaoRef.current = transcricaoRef.current
          ? `${transcricaoRef.current} ${textoInterimRef.current}`.trim()
          : textoInterimRef.current.trim()
        textoInterimRef.current = ''
        setTranscricao(transcricaoRef.current)
      }
      setOuvindo(false)
      recognitionRef.current = null
    }
    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      if (event.error === 'not-allowed') {
        setErro('Permissão de microfone negada.')
        setOuvindo(false)
        recognitionRef.current = null
      } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
        setErro('Não foi possível capturar a voz. Tente novamente.')
      }
    }
    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const bloco = event.results[i]
        const texto = bloco?.[0]?.transcript?.trim()
        if (!texto) continue
        if (bloco.isFinal) {
          transcricaoRef.current = transcricaoRef.current
            ? `${transcricaoRef.current} ${texto}`.trim()
            : texto
        } else {
          interim = interim ? `${interim} ${texto}` : texto
        }
      }
      textoInterimRef.current = interim
      const exibir = [transcricaoRef.current, interim].filter(Boolean).join(' ').trim()
      setTranscricao(exibir)
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
    } catch {
      setErro('Não foi possível iniciar o ditado por voz.')
      setOuvindo(false)
    }
  }, [idioma])

  useEffect(() => () => abortar(), [abortar])

  return {
    suportado,
    ouvindo,
    transcricao,
    erro,
    iniciar,
    parar,
    abortar,
    limpar,
    commitTranscricao,
    setTranscricao,
  }
}
