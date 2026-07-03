import { useCallback, useEffect, useRef, useState } from 'react'
import { navegadorSuportaDitadoVoz } from '@/hooks/useSpeechToText'
import {
  mesclarTrechoFinalTranscricao,
  montarTranscricaoExibida,
  normalizarEspacosTranscricao,
} from '@/lib/transcricao-voz-utils'

export type EstadoAvaliacaoVoz = 'idle' | 'listening' | 'paused' | 'finished'

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

const MAX_REINICIOS_SILENCIO = 12

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
  const [estado, setEstado] = useState<EstadoAvaliacaoVoz>('idle')
  const [transcricaoFinal, setTranscricaoFinal] = useState('')
  const [transcricaoInterim, setTranscricaoInterim] = useState('')
  const [trechos, setTrechos] = useState<string[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [avisoSilencio, setAvisoSilencio] = useState(false)

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const finalRef = useRef('')
  const interimRef = useRef('')
  const estadoRef = useRef<EstadoAvaliacaoVoz>('idle')
  const inicioTrechoRef = useRef(0)
  const reiniciosSilencioRef = useRef(0)
  const reiniciandoRef = useRef(false)

  const atualizarExibicao = useCallback(() => {
    setTranscricaoFinal(finalRef.current)
    setTranscricaoInterim(interimRef.current)
  }, [])

  const registrarTrechoAtual = useCallback(() => {
    const desde = inicioTrechoRef.current
    const trecho = finalRef.current.slice(desde).trim()
    if (trecho) {
      setTrechos((prev) => {
        if (prev[prev.length - 1]?.toLowerCase() === trecho.toLowerCase()) return prev
        return [...prev, trecho]
      })
    }
    inicioTrechoRef.current = finalRef.current.length
  }, [])

  const pararRecognition = useCallback((abortar = false) => {
    reiniciandoRef.current = false
    const rec = recognitionRef.current
    if (!rec) return
    recognitionRef.current = null
    try {
      if (abortar) rec.abort()
      else rec.stop()
    } catch {
      /* ignore */
    }
  }, [])

  const criarRecognitionRef = useRef<(() => SpeechRecognitionLike | null) | null>(null)

  const criarRecognition = useCallback(() => {
    const Ctor = obterSpeechRecognition()
    if (!Ctor) return null

    const recognition = new Ctor()
    recognition.lang = idioma
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      reiniciandoRef.current = false
      setAvisoSilencio(false)
      atualizarExibicao()
    }

    recognition.onend = () => {
      recognitionRef.current = null
      interimRef.current = ''
      atualizarExibicao()

      if (estadoRef.current === 'listening') {
        if (reiniciosSilencioRef.current < MAX_REINICIOS_SILENCIO) {
          reiniciosSilencioRef.current += 1
          reiniciandoRef.current = true
          window.setTimeout(() => {
            if (estadoRef.current !== 'listening') return
            const factory = criarRecognitionRef.current
            const nova = factory?.() ?? null
            if (!nova) {
              setAvisoSilencio(true)
              estadoRef.current = 'paused'
              setEstado('paused')
              return
            }
            recognitionRef.current = nova
            try {
              nova.start()
            } catch {
              setAvisoSilencio(true)
              estadoRef.current = 'paused'
              setEstado('paused')
            }
          }, 200)
        } else {
          setAvisoSilencio(true)
          estadoRef.current = 'paused'
          setEstado('paused')
        }
      }
    }

    recognition.onerror = (event: SpeechRecognitionErrorEventLike) => {
      if (event.error === 'not-allowed') {
        setErro('Permissão de microfone negada.')
        estadoRef.current = 'paused'
        setEstado('paused')
        pararRecognition(true)
      } else if (event.error === 'aborted') {
        /* pausa/finalizar intencional */
      } else if (event.error === 'no-speech') {
        /* onend cuida do reinício */
      } else {
        setErro('Não foi possível capturar a voz. Tente novamente.')
      }
    }

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      reiniciosSilencioRef.current = 0
      setAvisoSilencio(false)
      setErro(null)

      let interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const bloco = event.results[i]
        const texto = bloco?.[0]?.transcript?.trim()
        if (!texto) continue

        if (bloco.isFinal) {
          finalRef.current = mesclarTrechoFinalTranscricao(finalRef.current, texto)
          interimRef.current = ''
        } else {
          interim = interim ? `${interim} ${texto}` : texto
        }
      }

      if (interim) interimRef.current = interim
      atualizarExibicao()
    }

    return recognition
  }, [atualizarExibicao, idioma, pararRecognition])

  criarRecognitionRef.current = criarRecognition

  const iniciarEscuta = useCallback(() => {
    const recognition = criarRecognition()
    if (!recognition) {
      setErro('Este navegador não suporta ditado por voz. Use a digitação manual.')
      return false
    }

    setErro(null)
    setAvisoSilencio(false)
    reiniciosSilencioRef.current = 0
    recognitionRef.current = recognition

    try {
      recognition.start()
      return true
    } catch {
      setErro('Não foi possível iniciar o ditado por voz.')
      recognitionRef.current = null
      return false
    }
  }, [criarRecognition])

  const iniciarAvaliacao = useCallback(() => {
    finalRef.current = ''
    interimRef.current = ''
    inicioTrechoRef.current = 0
    setTrechos([])
    setErro(null)
    setAvisoSilencio(false)
    estadoRef.current = 'listening'
    setEstado('listening')
    atualizarExibicao()
    iniciarEscuta()
  }, [atualizarExibicao, iniciarEscuta])

  const pausar = useCallback(() => {
    if (estadoRef.current !== 'listening') return
    estadoRef.current = 'paused'
    setEstado('paused')
    registrarTrechoAtual()
    interimRef.current = ''
    pararRecognition(false)
    atualizarExibicao()
  }, [atualizarExibicao, pararRecognition, registrarTrechoAtual])

  const continuar = useCallback(() => {
    if (estadoRef.current !== 'paused') return
    setErro(null)
    setAvisoSilencio(false)
    estadoRef.current = 'listening'
    setEstado('listening')
    inicioTrechoRef.current = finalRef.current.length
    iniciarEscuta()
  }, [iniciarEscuta])

  const finalizar = useCallback((): string => {
    estadoRef.current = 'finished'
    setEstado('finished')
    registrarTrechoAtual()
    interimRef.current = ''
    pararRecognition(false)
    atualizarExibicao()
    return finalRef.current
  }, [atualizarExibicao, pararRecognition, registrarTrechoAtual])

  const abortar = useCallback(() => {
    estadoRef.current = 'idle'
    setEstado('idle')
    pararRecognition(true)
    interimRef.current = ''
    atualizarExibicao()
  }, [atualizarExibicao, pararRecognition])

  const limpar = useCallback(() => {
    abortar()
    finalRef.current = ''
    interimRef.current = ''
    inicioTrechoRef.current = 0
    reiniciosSilencioRef.current = 0
    setTrechos([])
    setErro(null)
    setAvisoSilencio(false)
    setTranscricaoFinal('')
    setTranscricaoInterim('')
  }, [abortar])

  const setTranscricaoManual = useCallback(
    (texto: string) => {
      const limpo = normalizarEspacosTranscricao(texto)
      finalRef.current = limpo
      interimRef.current = ''
      atualizarExibicao()
      if (estadoRef.current === 'listening') {
        pausar()
      }
    },
    [atualizarExibicao, pausar]
  )

  useEffect(() => () => pararRecognition(true), [pararRecognition])

  const transcricaoExibida = montarTranscricaoExibida(transcricaoFinal, transcricaoInterim)
  const ouvindo = estado === 'listening'

  return {
    suportado,
    estado,
    ouvindo,
    transcricao: transcricaoExibida,
    transcricaoFinal,
    transcricaoInterim,
    trechos,
    erro,
    avisoSilencio,
    iniciarAvaliacao,
    pausar,
    continuar,
    finalizar,
    abortar,
    limpar,
    setTranscricao: setTranscricaoManual,
  }
}
