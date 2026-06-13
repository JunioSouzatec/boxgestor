import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'

export const FORMATO_DATA = 'yyyy-MM-dd'

export function formatarDataISO(date: Date): string {
  return format(date, FORMATO_DATA)
}

export function parseDataISO(data: string): Date {
  return parseISO(data)
}

export function obterDiasDoMes(mesReferencia: Date): Date[] {
  const inicio = startOfWeek(startOfMonth(mesReferencia), { weekStartsOn: 0 })
  const fim = endOfWeek(endOfMonth(mesReferencia), { weekStartsOn: 0 })
  return eachDayOfInterval({ start: inicio, end: fim })
}

export function obterTituloMes(mesReferencia: Date): string {
  return format(mesReferencia, 'MMMM yyyy', { locale: ptBR })
}

export function mesAnterior(mesReferencia: Date): Date {
  return subMonths(mesReferencia, 1)
}

export function mesProximo(mesReferencia: Date): Date {
  return addMonths(mesReferencia, 1)
}

export function ehDiaAtual(dia: Date): boolean {
  return isToday(dia)
}

export function ehMesReferencia(dia: Date, mesReferencia: Date): boolean {
  return isSameMonth(dia, mesReferencia)
}

export function ehDiaSelecionado(dia: Date, dataSelecionada: string): boolean {
  return isSameDay(dia, parseDataISO(dataSelecionada))
}

export function contarAgendamentosPorDia(
  agendamentos: { data: string }[]
): Record<string, number> {
  return agendamentos.reduce<Record<string, number>>((acc, ag) => {
    acc[ag.data] = (acc[ag.data] ?? 0) + 1
    return acc
  }, {})
}

export const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
