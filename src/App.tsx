import { useEffect, useState, useCallback } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import "./index.css"; // Certifique-se de que este arquivo existe e importa o Tailwind CSS

/* -------------------------------------------------
   Configurações Supabase (variáveis de ambiente)
   ------------------------------------------------- */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

if (!supabaseUrl || !supabaseKey) {
  console.error(
    "Erro: Variáveis de ambiente VITE_SUPABASE_URL ou VITE_SUPABASE_PUBLISHABLE_KEY não configuradas."
  );
  // Você pode adicionar um alerta ou renderizar uma mensagem de erro na UI
}

const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);

/* -------------------------------------------------
   Tipos de dados
   ------------------------------------------------- */
type StatusOS = "ABERTA" | "EM ANDAMENTO" | "CONCLUÍDA" | "CANCELADA";
type TipoTransacao = "RECEITA" | "DESPESA";

interface OrdemServico {
  id: string;
  cliente: string;
  placa: string;
  modelo: string;
  marca: string;
  cor: string;
  status: StatusOS;
  dataCriacao: string; // ISO string
  servicos: string[];
  valorMaoObra: number;
  valorPecas: number;
  observacoes?: string;
}

interface Transacao {
  id: string;
  descricao: string;
  valor: number;
  tipo: TipoTransacao;
  categoria: string;
  data: string; // ISO string
  recorrente?: boolean;
  parcelas?: number;
  parcelaAtual?: number;
  faturaId?: string; // Para agrupar parcelas de uma fatura
}

/* -------------------------------------------------
   Funções auxiliares
   ------------------------------------------------- */
const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);

const formatDateTime = (date: Date) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

const toUpper = (s: string) => s.toUpperCase();

/* -------------------------------------------------
   Componente principal
   ------------------------------------------------- */
export default function App() {
  /* ---------- Estado ---------- */
  const [osList, setOsList] = useState<OrdemServico[]>([]);
  const [transacoes, setTransacoes] = useState<Transacao[]>([]);
  const [selectedOS, setSelectedOS] = useState<OrdemServico | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [bgColor, setBgColor] = useState(
    localStorage.getItem("bgColor") || "#f9fafb"
  );
  const [gestorNome, setGestorNome] = useState(
    localStorage.getItem("gestorNome") || "Gestor"
  );
  const [activeTab, setActiveTab] = useState<"ordens" | "despesas">(
    "ordens"
  );
  const [searchQuery, setSearchQuery] = useState("");

  // Estado para nova transação
  const [novaTransacao, setNovaTransacao] = useState<Partial<Transacao>>({
    tipo: "DESPESA",
    categoria: "Alimentação",
    data: new Date().toISOString(),
    valor: 0,
    descricao: "",
    recorrente: false,
    parcelas: 1,
  });

  const categoriasReceita = [
    "Salário",
    "Renda extra",
    "Pix recebido",
    "Investimentos",
    "Reembolso",
    "Outros",
  ];
  const categoriasDespesa = [
    "Alimentação",
    "Transporte",
    "Moradia",
    "Saúde",
    "Educação",
    "Lazer",
    "Cartão de crédito",
    "Outros",
  ];

  /* ---------- Carregar dados do Supabase ---------- */
  const fetchOS = useCallback(async () => {
    const { data, error } = await supabase
      .from("ordens_servico")
      .select("*")
      .order("dataCriacao", { ascending: false });
    if (error) console.error("Erro ao buscar OS:", error);
    else setOsList((data ?? []) as OrdemServico[]);
  }, []);

  const fetchTransacoes = useCallback(async () => {
    const { data, error } = await supabase
      .from("transacoes")
      .select("*")
      .order("data", { ascending: false });
    if (error) console.error("Erro ao buscar transações:", error);
    else setTransacoes((data ?? []) as Transacao[]);
  }, []);

  useEffect(() => {
    fetchOS();
    fetchTransacoes();

    // Escuta em tempo real para OS
    const osSubscription = supabase
      .channel("public:ordens_servico")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "ordens_servico" },
        () => fetchOS()
      )
      .subscribe();

    // Escuta em tempo real para Transações
    const transacoesSubscription = supabase
      .channel("public:transacoes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transacoes" },
        () => fetchTransacoes()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(osSubscription);
      supabase.removeChannel(transacoesSubscription);
    };
  }, [fetchOS, fetchTransacoes]);

  /* ---------- Manipuladores ---------- */
  const mudarStatusOS = async (id: string, novoStatus: StatusOS) => {
    const { error } = await supabase
      .from("ordens_servico")
      .update({ status: novoStatus })
      .eq("id", id);
    if (error) console.error("Erro ao mudar status da OS:", error);
    else fetchOS(); // Recarrega para atualizar a UI
  };

  const abrirDetalheOS = (os: OrdemServico) => {
    setSelectedOS(os);
    setShowDetail(true);
  };

  const fecharDetalheOS = () => {
    setShowDetail(false);
    setSelectedOS(null);
  };

  const salvarNomeGestor = () => {
    localStorage.setItem("gestorNome", gestorNome);
    alert("Nome do gestor salvo!");
  };

  const salvarCorFundo = () => {
    localStorage.setItem("bgColor", bgColor);
    alert("Cor de fundo salva!");
  };

  const handleNovaTransacaoChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    const { name, value, type, checked } = e.target as HTMLInputElement;
    setNovaTransacao((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const adicionarTransacao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!novaTransacao.descricao || !novaTransacao.valor) {
      alert("Descrição e valor são obrigatórios.");
      return;
    }

    const transacaoParaSalvar: Partial<Transacao> = {
      ...novaTransacao,
      valor: parseFloat(String(novaTransacao.valor)), // Garante que é número
    };

    const { error } = await supabase
      .from("transacoes")
      .insert([transacaoParaSalvar]);

    if (error) {
      console.error("Erro ao adicionar transação:", error);
      alert("Erro ao adicionar transação.");
    } else {
      alert("Transação adicionada!");
      setNovaTransacao({
        tipo: "DESPESA",
        categoria: "Alimentação",
        data: new Date().toISOString(),
        valor: 0,
        descricao: "",
        recorrente: false,
        parcelas: 1,
      });
      fetchTransacoes(); // Recarrega a lista de transações
    }
  };

  const marcarFaturaPaga = async (transacaoId: string, faturaId: string) => {
    // Lógica para marcar fatura como paga
    alert(`Fatura ${faturaId} paga! (Transação: ${transacaoId})`);
    // Aqui você adicionaria a lógica real para atualizar o Supabase
  };

  const filteredOsList = osList.filter((os) =>
    os.cliente.toLowerCase().includes(searchQuery.toLowerCase()) ||
    os.placa.toLowerCase().includes(searchQuery.toLowerCase()) ||
    os.modelo.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredTransacoes = transacoes.filter((t) =>
    t.descricao.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.categoria.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div
      className="min-h-screen p-4"
      style={{ backgroundColor: bgColor, transition: "background-color 0.3s" }}
    >
      <header className="flex flex-col md:flex-row justify-between items-center mb-8">
        <div className="flex items-center mb-4 md:mb-0">
          <div className="bg-green-500 text-white font-bold text-2xl p-2 rounded-full mr-3">
            N
          </div>
          <h1 className="text-3xl font-bold text-gray-800">
            Olá, {gestorNome}!
          </h1>
        </div>

        <div className="flex flex-col md:flex-row items-center space-y-2 md:space-y-0 md:space-x-4">
          <input
            type="text"
            placeholder="Nome do Gestor"
            value={gestorNome}
            onChange={(e) => setGestorNome(e.target.value)}
            className="p-2 border border-gray-300 rounded-md"
          />
          <button
            onClick={salvarNomeGestor}
            className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-md shadow-sm hover:bg-indigo-700"
          >
            Salvar Nome
          </button>

          <input
            type="color"
            value={bgColor}
            onChange={(e) => setBgColor(e.target.value)}
            className="p-1 border border-gray-300 rounded-md h-10 w-10"
            title="Escolher cor de fundo"
          />
          <button
            onClick={salvarCorFundo}
            className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-md shadow-sm hover:bg-indigo-700"
          >
            Salvar Cor
          </button>
        </div>
      </header>

      <nav className="mb-8">
        <ul className="flex space-x-4 border-b border-gray-200">
          <li>
            <button
              onClick={() => setActiveTab("ordens")}
              className={`py-2 px-4 text-lg font-medium ${
                activeTab === "ordens"
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Ordens de Serviço
            </button>
          </li>
          <li>
            <button
              onClick={() => setActiveTab("despesas")}
              className={`py-2 px-4 text-lg font-medium ${
                activeTab === "despesas"
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Despesas
            </button>
          </li>
        </ul>
      </nav>

      <main>
        <div className="mb-6">
          <input
            type="text"
            placeholder="Buscar..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {activeTab === "ordens" && (
          <section>
            <h2 className="text-2xl font-bold mb-4">Ordens de Serviço</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredOsList.length === 0 ? (
                <p className="col-span-full text-center text-gray-500">
                  Nenhuma ordem de serviço encontrada.
                </p>
              ) : (
                filteredOsList.map((os) => (
                  <div
                    key={os.id}
                    className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow duration-200 cursor-pointer"
                    onClick={() => abrirDetalheOS(os)}
                  >
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-xl font-semibold text-gray-800">
                        {os.cliente}
                      </h3>
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium ${
                          os.status === "ABERTA"
                            ? "bg-yellow-100 text-yellow-800"
                            : os.status === "EM ANDAMENTO"
                            ? "bg-blue-100 text-blue-800"
                            : os.status === "CONCLUÍDA"
                            ? "bg-green-100 text-green-800"
                            : "bg-red-100 text-red-800"
                        }`}
                      >
                        {os.status}
                      </span>
                    </div>
                    <p className="text-gray-600">
                      <strong className="font-medium">Placa:</strong>{" "}
                      {toUpper(os.placa)}
                    </p>
                    <p className="text-gray-600">
                      <strong className="font-medium">Modelo:</strong>{" "}
                      {toUpper(os.modelo)}
                    </p>
                    <p className="text-gray-600">
                      <strong className="font-medium">Marca:</strong>{" "}
                      {toUpper(os.marca)}
                    </p>
                    <p className="text-gray-600">
                      <strong className="font-medium">Cor:</strong>{" "}
                      {toUpper(os.cor)}
                    </p>
                    <p className="text-gray-600 mt-2 text-sm">
                      Criada em: {formatDate(new Date(os.dataCriacao))}
                    </p>
                    <div className="mt-4 flex space-x-2">
                      <select
                        value={os.status}
                        onChange={(e) =>
                          mudarStatusOS(os.id, e.target.value as StatusOS)
                        }
                        onClick={(e) => e.stopPropagation()} // Impede que o clique no select abra o detalhe da OS
                        className="p-2 border border-gray-300 rounded-md text-sm"
                      >
                        <option value="ABERTA">Aberta</option>
                        <option value="EM ANDAMENTO">Em Andamento</option>
                        <option value="CONCLUÍDA">Concluída</option>
                        <option value="CANCELADA">Cancelada</option>
                      </select>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        )}

        {activeTab === "despesas" && (
          <section>
            <h2 className="text-2xl font-bold mb-4">Adicionar Nova Transação</h2>
            <form onSubmit={adicionarTransacao} className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-white p-6 rounded-lg shadow-md">
              <div>
                <label className="block text-sm font-medium text-gray-700">Tipo</label>
                <select
                  name="tipo"
                  value={novaTransacao.tipo}
                  onChange={handleNovaTransacaoChange}
                  className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm"
                >
                  <option value="DESPESA">Despesa</option>
                  <option value="RECEITA">Receita</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Categoria</label>
                <select
                  name="categoria"
                  value={novaTransacao.categoria}
                  onChange={handleNovaTransacaoChange}
                  className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm"
                >
                  {novaTransacao.tipo === "RECEITA"
                    ? categoriasReceita.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))
                    : categoriasDespesa.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Descrição</label>
                <input
                  type="text"
                  name="descricao"
                  value={novaTransacao.descricao}
                  onChange={handleNovaTransacaoChange}
                  className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Valor</label>
                <input
                  type="number"
                  name="valor"
                  value={novaTransacao.valor}
                  onChange={handleNovaTransacaoChange}
                  className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm"
                  step="0.01"
                  required
                />
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  name="recorrente"
                  checked={novaTransacao.recorrente}
                  onChange={handleNovaTransacaoChange}
                  className="h-4 w-4 text-indigo-600 border-gray-300 rounded"
                />
                <label className="text-sm font-medium text-gray-700">Recorrente</label>
              </div>
              {!novaTransacao.recorrente && (
                <div>
                  <label className="block text-sm font-medium text-gray-700">Parcelas</label>
                  <input
                    type="number"
                    name="parcelas"
                    value={novaTransacao.parcelas}
                    onChange={handleNovaTransacaoChange}
                    className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm"
                    min="1"
                  />
                </div>
              )}
              <div className="col-span-full">
                <button
                  type="submit"
                  className="w-full px-4 py-2 bg-blue-600 text-white font-semibold rounded-md shadow-sm hover:bg-blue-700"
                >
                  Adicionar Transação
                </button>
              </div>
            </form>

            <h3 className="text-xl font-semibold mt-8 mb-4">Histórico de Transações</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Data/Hora</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tipo</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Categoria</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Descrição</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valor</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ações</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredTransacoes.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-4 whitespace-nowrap text-center text-gray-500">
                        Nenhuma transação encontrada.
                      </td>
                    </tr>
                  ) : (
                    filteredTransacoes.map((t) => (
                      <tr key={t.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatDateTime(new Date(t.data))}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${t.tipo === 'RECEITA' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {t.tipo}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{t.categoria}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{t.descricao}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {t.valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          {t.categoria === "Cartão de crédito" && t.parcelas && t.parcelaAtual && t.parcelaAtual < t.parcelas && (
                            <button
                              onClick={() => marcarFaturaPaga(t.id, t.faturaId || t.id)}
                              className="text-indigo-600 hover:text-indigo-900 mr-2"
                            >
                              Pagar Fatura
                            </button>
                          )}
                          {/* Adicionar botões de editar/excluir aqui */}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Modal de detalhe da OS */}
        {showDetail && selectedOS && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg w-11/12 md:w-2/3 lg:w-1/2 p-6 overflow-y-auto max-h-[90vh]">
              <button
                onClick={fecharDetalheOS}
                className="float-right text-gray-500 hover:text-gray-800 text-2xl"
              >
                ✕
              </button>
              <h2 className="text-2xl font-bold mb-4">
                Detalhes da OS – {selectedOS.cliente}
              </h2>
              <p>
                <strong>Placa:</strong> {toUpper(selectedOS.placa)}
              </p>
              <p>
                <strong>Modelo:</strong> {toUpper(selectedOS.modelo)}
              </p>
              <p>
                <strong>Marca:</strong> {toUpper(selectedOS.marca)}
              </p>
              <p>
                <strong>Cor:</strong> {toUpper(selectedOS.cor)}
              </p>
              <p>
                <strong>Status:</strong> {selectedOS.status}
              </p>
              <p>
                <strong>Data de criação:</strong>{" "}
                {formatDate(new Date(selectedOS.dataCriacao))}
              </p>

              <h3 className="mt-4 font-semibold">Serviços realizados</h3>
              {selectedOS.servicos && selectedOS.servicos.length > 0 ? (
                <ul className="list-disc list-inside">
                  {selectedOS.servicos.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              ) : (
                <p>Nenhum serviço registrado.</p>
              )}

              <div className="mt-4 grid grid-cols-2 gap-2">
                <div>
                  <strong>Valor da mão de obra:</strong>{" "}
                  {selectedOS.valorMaoObra.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </div>
                <div>
                  <strong>Valor das peças:</strong>{" "}
                  {selectedOS.valorPecas.toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </div>
                <div className="col-span-2 font-bold">
                  <strong>Total:</strong>{" "}
                  {(
                    selectedOS.valorMaoObra + selectedOS.valorPecas
                  ).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </div>
              </div>
              {selectedOS.observacoes && (
                <div className="mt-4">
                  <strong>Observações:</strong> {selectedOS.observacoes}
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Rodapé opcional */}
      <footer className="mt-8 text-center text-sm text-gray-500 p-4">
        © {new Date().getFullYear()} Oficina Craft – Todos os direitos reservados
      </footer>
    </div>
  );
}