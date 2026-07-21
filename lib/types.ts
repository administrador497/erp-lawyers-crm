export type CurrentUsuario = {
  id: string;
  nombre_completo: string;
  correo: string;
  rol: string | null;
  debe_cambiar_password: boolean;
  correo_verificado: boolean;
  activo: boolean;
};

export type NewLeadRow = {
  id: string;
  nombre_completo: string;
  correo: string | null;
  telefono: string | null;
  canal_origen: string;
  fuente: string | null;
  servicio: string | null;
  prioridad: string;
  ingreso: string;
  responsable_id: string;
  responsable_nombre: string;
};

export type AssignableUsuario = {
  id: string;
  nombre_completo: string;
};

export type ConversacionRow = {
  id: string;
  estado: string;
  lead_id: string | null;
  canal: string | null;
  contacto_nombre: string;
  contacto_correo: string | null;
  contacto_telefono: string | null;
  servicio: string | null;
  etapa: string | null;
  prioridad: string;
  lead_estado: string;
  responsable_id: string | null;
  responsable_nombre: string | null;
  ultimo_mensaje: string | null;
  ultimo_mensaje_fecha: string;
};

export type AdjuntoRow = {
  id: string;
  nombre_original: string;
  tipo_mime: string | null;
  tamano_bytes: number | null;
};

export type MensajeRow = {
  id: string;
  canal: string;
  direccion: "entrante" | "saliente";
  remitente: string | null;
  destinatarios: string[] | null;
  asunto: string | null;
  cuerpo: string;
  created_at: string;
  adjuntos?: AdjuntoRow[];
};

export type EtapaRow = {
  id: string;
  nombre: string;
  orden: number;
};

export type PipelineLeadRow = {
  id: string;
  nombre_completo: string;
  servicio: string | null;
  valor_potencial: number | null;
  prioridad: string;
  etapa_id: string;
  responsable_id: string | null;
  responsable_nombre: string | null;
};

export type MotivoPerdidaRow = {
  id: string;
  nombre: string;
};

export type ContactListRow = {
  id: string;
  nombre_completo: string;
  servicio: string | null;
  prioridad: string;
};

export type ServicioRow = {
  id: string;
  nombre: string;
};

export type ContactDetail = {
  lead_id: string;
  contacto_id: string;
  nombre: string;
  primer_apellido: string | null;
  segundo_apellido: string | null;
  nombre_completo: string;
  correo: string | null;
  telefono: string | null;
  pais: string | null;
  etiquetas: string[];
  notas: string | null;
  servicio: string | null;
  canal_origen: string;
  responsable_nombre: string | null;
  prioridad: string;
  valor_potencial: number | null;
  estado: string;
  etapa: string | null;
  ingreso: string;
};

export type HistorialItem = {
  when: string;
  text: string;
};

export type ActividadRow = {
  id: string;
  tipo: string;
  fecha: string;
  estado: string;
  descripcion: string | null;
  resultado: string | null;
  proxima_accion: string | null;
  lead_id: string | null;
  lead_nombre: string;
  servicio: string | null;
  responsable_nombre: string | null;
};

export type FormularioCampo = {
  id: string;
  label: string;
  type: string;
  required: boolean;
  placeholder: string;
};

export type FormularioListRow = {
  id: string;
  nombre: string;
  activo: boolean;
  campos_count: number;
};

export type FormularioDetail = {
  id: string;
  nombre: string;
  activo: boolean;
  campos: FormularioCampo[];
};

export type ReportChannelBar = {
  canal_origen: string;
  label: string;
  value: number;
};

export type ReportFunnelStage = {
  label: string;
  value: number;
  pct: number;
};

export type ReportUserSla = {
  usuario_id: string;
  nombre: string;
  leads_asignados: number;
  tiempo_promedio_horas: number | null;
};

export type ReportsSummary = {
  channelBars: ReportChannelBar[];
  funnel: ReportFunnelStage[];
  slaByUser: ReportUserSla[];
  totalLeads: number;
};

export type RolRow = {
  id: string;
  nombre: string;
};

export type EquipoRow = {
  id: string;
  nombre: string;
};

export type UsuarioRow = {
  id: string;
  nombre_completo: string;
  correo: string;
  activo: boolean;
  debe_cambiar_password: boolean;
  canales_autorizados: string[];
  rol_id: string | null;
  rol_nombre: string;
  equipo_id: string | null;
  equipo_nombre: string | null;
};

export type DashboardKpis = {
  leadsRecibidosMes: number;
  tiempoPromedioRespuestaHoras: number | null;
  tasaConversionPct: number;
  leadsSinSeguimiento: number;
};

export type DashboardHistorialItem = {
  when: string;
  text: string;
};

export type DashboardProximaActividad = {
  id: string;
  tipo: string;
  fecha: string;
  lead_nombre: string;
};

export type DashboardSummary = {
  scope: "general" | "personal";
  kpis: DashboardKpis;
  actividadReciente: DashboardHistorialItem[];
  proximasActividades: DashboardProximaActividad[];
};
