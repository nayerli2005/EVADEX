import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { initializeApp } from 'firebase/app';

import { initializeFirestore, memoryLocalCache, doc, getDoc, setDoc, runTransaction } from 'firebase/firestore';

export interface VotoOral {
  evaluadorNombre: string;
  lectura: number;
  claridad: number;
  total: number;
}

export interface VotoCuestionario {
  evaluadorNombre: string;
  herramienta: number;
  cantidad: number;
  total: number;
}

export interface RubricaInforme {
  formato: number | null;
  referencias: number | null;
  total: number;
  comentarios?: string;
}

export interface RubricaDiapositivas {
  formato: number | null;
  pertinencia: number | null;
  referencias: number | null;
  total: number;
  comentarios?: string;
}

export interface RubricaCuestionarioDocente {
  referenciaPreguntas: number | null;
  coherenciaPreguntas: number | null;
  total: number;
  comentarios?: string;
}

export interface Estudiante {
  id: number;
  nombre: string;
  rol: 'Expositor' | 'Evaluador';
  esLider?: boolean;
  informe?: RubricaInforme;
  diapositivas?: RubricaDiapositivas;
  cuestionarioDocente?: RubricaCuestionarioDocente;
  votosOral?: VotoOral[];
  votosCuestionario?: VotoCuestionario[];
  promedioCoevaluacion: number;
  notaFinal: number;
}

export interface Grupo {
  id: number;
  nombre: string;
  integrantes: Estudiante[];
}

export interface CursoConfig {
  id: string;
  nombre: string;
  paralelo: string;
  clave: string;
}

const firebaseConfig = {
  apiKey: "AIzaSyAlUxip7wSsSdFoClaETvhZYWPN664DiyQ",
  authDomain: "evaluacion-utmach.firebaseapp.com",
  projectId: "evaluacion-utmach",
  storageBucket: "evaluacion-utmach.firebasestorage.app",
  messagingSenderId: "861291389109",
  appId: "1:861291389109:web:44af41cc0c848b2e235efc",
  measurementId: "G-L53QEGHJ3E"
};

const appFirebase = initializeApp(firebaseConfig);
// Optimización de Firestore con caché local para máxima fluidez
const db = initializeFirestore(appFirebase, {
  localCache: memoryLocalCache()
});

const CURSOS_INICIALES: CursoConfig[] = [
  { id: 'segundo_a', nombre: 'Segundo Semestre', paralelo: 'A', clave: 'segundoa2026@' },
  { id: 'segundo_b', nombre: 'Segundo Semestre', paralelo: 'B', clave: 'segundob2026@' },
  { id: 'segundo_c', nombre: 'Segundo Semestre', paralelo: 'C', clave: 'segundoc2026@' },
  { id: 'cuarto_a', nombre: 'Cuarto Semestre', paralelo: 'A', clave: 'cuartoa2026@' },
  { id: 'cuarto_b', nombre: 'Cuarto Semestre', paralelo: 'B', clave: 'cuartob2026@' },
  { id: 'cuarto_c', nombre: 'Cuarto Semestre', paralelo: 'C', clave: 'cuartoc2026@' },
  { id: 'quinto_a', nombre: 'Quinto Semestre', paralelo: 'A', clave: 'quintoa2026@' },
  { id: 'quinto_b', nombre: 'Quinto Semestre', paralelo: 'B', clave: 'quintob2026.@' }
];

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  
  // ==================== NUEVO LOGIN PRINCIPAL ====================

  loginPendiente: boolean = true;

  tipoLoginPrincipal: 'estudiante' | 'docente' = 'estudiante';

  usuarioLoginPrincipal: string = '';
  claveLoginPrincipal: string = '';
  cursoLoginPrincipalId: string = '';

  errorLoginPrincipal: string = '';
  procesandoLoginPrincipal: boolean = false;

  seleccionarTipoLogin(tipo: 'estudiante' | 'docente') {
    this.tipoLoginPrincipal = tipo;
    this.usuarioLoginPrincipal = '';
    this.claveLoginPrincipal = '';
    this.errorLoginPrincipal = '';
  }

  
async ingresarLoginPrincipal() {

  if (this.procesandoLoginPrincipal) return;

  const usuario = this.usuarioLoginPrincipal.trim();
  const clave = this.claveLoginPrincipal;

  this.errorLoginPrincipal = '';

  if (!usuario || !clave) {
    this.errorLoginPrincipal = 'Ingresa tu usuario y contraseña.';
    return;
  }

  this.procesandoLoginPrincipal = true;

  try {

    // ==============================
    // ACCESO DEL DOCENTE
    // ==============================

    if (this.tipoLoginPrincipal === 'docente') {

      const correoIngresado = usuario.toLowerCase();

      // Comprobar correo institucional
      if (
        !this.correoDocenteCorrecto ||
        correoIngresado !== this.correoDocenteCorrecto
      ) {
        this.errorLoginPrincipal =
          'Correo institucional no autorizado.';
        return;
      }

      // Mantener la validación docente original
      this.claveDocenteInput = clave;

      await this.iniciarSesionDocente();

      if (this.vistaActual === 'panel_docente') {
        this.inicioDocente = true;

        this.loginPendiente = false;
        this.claveLoginPrincipal = '';

      } else {

        this.errorLoginPrincipal =
          'Contraseña docente incorrecta.';

      }

    } else {

      // ==============================
      // ACCESO DEL ESTUDIANTE
      // ==============================

      if (!this.cursoLoginPrincipalId) {
        this.errorLoginPrincipal = 'Selecciona tu curso.';
        return;
      }

      // Buscar el curso que ya está cargado
      const curso = this.cursos.find(
        c => c.id === this.cursoLoginPrincipalId
      );

      // Comprobar la contraseña del curso
      if (!curso || clave.trim() !== curso.clave) {
        this.errorLoginPrincipal =
          'Contraseña del curso incorrecta.';
        return;
      }
      
      // ===== VALIDAR PERTENENCIA DEL ESTUDIANTE =====

      // Leer directamente el paralelo seleccionado en Firestore.
      const docRefEstudiante = doc(
        db,
        curso.id,
        this.hemisemestreActivo
      );

      const snapEstudiante = await getDoc(docRefEstudiante);

      if (!snapEstudiante.exists()) {
        this.errorLoginPrincipal =
          'No existen estudiantes registrados en este paralelo y periodo.';
        return;
      }

      const gruposRegistrados: Grupo[] =
        snapEstudiante.data()['grupos'] || [];

      // Buscar coincidencia con el nombre completo.
      const nombreIngresado = this.normalizarTexto(usuario)
        .replace(/\s+/g, ' ');

      
      // Buscar coincidencias dentro del paralelo seleccionado
      const coincidencias = gruposRegistrados
        .flatMap(grupo => grupo.integrantes || [])
        .filter(estudiante =>
          this.coincideNombreEstudiante(
            usuario,
            estudiante.nombre
          )
        );

      // Si hay varios estudiantes coincidentes, no adivinar.
      if (coincidencias.length > 1) {
        this.errorLoginPrincipal =
          'Hay varios estudiantes con ese nombre. ' +
          'Escribe más nombres o apellidos para identificarte.';
        return;
      }

      const estudianteRegistrado = coincidencias[0];


      if (!estudianteRegistrado) {
        this.errorLoginPrincipal =
          'Acceso denegado: tu nombre no está registrado en el paralelo seleccionado.';
        return;
      }

      // Utilizar el nombre oficial registrado por el docente.
      this.usuarioLoginPrincipal = estudianteRegistrado.nombre;

      // ===== FIN DE VALIDACIÓN =====

      // Preparar los datos del estudiante
      this.cursoEstudianteSeleccionadoId = curso.id;
      this.nombreEvaluadorInput = estudianteRegistrado.nombre;
      this.grupoEstudianteSeleccionadoId = null;

      this.claveEstudianteInput = '';
      this.errorClaveEstudiante = false;

      // Mostrar el nuevo panel estudiantil
      this.vistaActual = 'inicio_estudiante';
      this.loginPendiente = false;
      this.claveLoginPrincipal = '';

      // Indicar que se están cargando los grupos
      this.cargandoGruposEstudiante = true;
      this.errorCargaGruposEstudiante = '';

      this.cdr.detectChanges();

      // Cargar grupos desde Firebase sin bloquear el panel
      void this.cargarDatosCurso(
        curso.id,
        this.hemisemestreActivo
      ).then(() => {

        this.cargandoGruposEstudiante = false;
        this.cdr.detectChanges();

      }).catch(error => {

        console.error('Error cargando grupos:', error);

        this.errorCargaGruposEstudiante =
          'No se pudieron cargar los grupos.';

        this.cargandoGruposEstudiante = false;
        this.cdr.detectChanges();

      });

    }

  } catch (error) {

    console.error('Error en el nuevo login:', error);

    this.errorLoginPrincipal =
      'No se pudo completar el acceso.';

  } finally {

    this.procesandoLoginPrincipal = false;
    this.cdr.detectChanges();

  }
}

  recuperarAccesoPrincipal() {
    alert(
      'Para recuperar tu contraseña, comunícate con el docente o administrador de EVADEX.'
    );
  }

  // ==================== FIN DEL NUEVO LOGIN ====================

  vistaActual: string = 'portal_inicio';

  hemisemestreActivo: 'hemisemestre_1' | 'hemisemestre_2' = 'hemisemestre_1';
  hemisemestreDocenteVista: 'hemisemestre_1' | 'hemisemestre_2' = 'hemisemestre_1';

  cursos: CursoConfig[] = [...CURSOS_INICIALES];
  cursoDocenteSeleccionadoId: string = 'quinto_a';

  claveDocenteInput: string = '';
  claveDocenteCorrecta: string = 'Novillo2026.@';
  correoDocenteCorrecto: string = '';
  nuevaClaveDocenteInput: string = '';
  errorClaveDocente: boolean = false;
  seccionDocente: 'calificar' | 'estudiantes' | 'claves' = 'calificar';
  
  // ===== NAVEGACIÓN VISUAL DEL PANEL DOCENTE =====

  inicioDocente: boolean = true;
  cargandoDatosDocente: boolean = false;
  errorCargaDocente: string = '';
  menuDocenteAbierto: boolean = false;

  abrirInicioDocente() {
    this.inicioDocente = true;
    this.menuDocenteAbierto = false;
    this.cdr.detectChanges();
  }

  abrirModuloDocente(
    modulo: 'calificar' | 'estudiantes' | 'claves'
  ) {
    this.seccionDocente = modulo;
    this.inicioDocente = false;
    this.menuDocenteAbierto = false;
    this.cdr.detectChanges();
  }


  nuevoCursoNombre: string = '';
  nuevoCursoParalelo: string = '';
  nuevoCursoClave: string = '';

  nuevoGrupoNombre: string = '';
  grupoSeleccionadoParaEstudiante: number | null = null;
  nuevoEstudianteNombre: string = '';
  nuevoEstudianteRol: 'Expositor' | 'Evaluador' = 'Expositor';
  nuevoEstudianteEsLider: boolean = false;

  gruposCursoActual: Grupo[] = [];

  grupoDocenteId: number | null = null;
  estudianteSeleccionadoId: number | null = null;

  docenteInformeFormato: number | null = null;
  docenteInformeReferencias: number | null = null;
  docenteInformeComentarios: string = '';

  docenteDiapositivasFormato: number | null = null;
  docenteDiapositivasPertinencia: number | null = null;
  docenteDiapositivasReferencias: number | null = null;
  docenteDiapositivasComentarios: string = '';

  docenteCuestionarioReferencia: number | null = null;
  docenteCuestionarioCoherencia: number | null = null;
  docenteCuestionarioComentarios: string = '';

  cursoEstudianteSeleccionadoId: string = '';
  claveEstudianteInput: string = '';
  errorClaveEstudiante: boolean = false;
  nombreEvaluadorInput: string = '';
  grupoEstudianteSeleccionadoId: number | null = null;
  rubricaTemporalOral: { [estudianteId: number]: { lectura: number; claridad: number } } = {};
  rubricaTemporalCuestionario: { herramienta: number; cantidad: number } = { herramienta: 15, cantidad: 15 };
  guardandoEnProceso: boolean = false;
  cargandoGruposEstudiante: boolean = false;
  errorCargaGruposEstudiante: string = '';

  cursoConsultaId: string = 'quinto_a';
  hemiConsulta: 'hemisemestre_1' | 'hemisemestre_2' = 'hemisemestre_1';
  nombreConsultaInput: string = '';
  resultadoConsulta: { estudiante: Estudiante; grupo: Grupo } | null = null;
  consultaRealizada: boolean = false;

   // ===== NUEVO PANEL ESTUDIANTIL =====

  menuEstudianteAbierto: boolean = false;

  get nombrePerfilEstudiante(): string {
    return this.usuarioLoginPrincipal.trim() || 'Estudiante';
  }

  abrirSeccionEstudiante(
    seccion: 'inicio_estudiante' | 'panel_estudiante' |
             'consulta_notas' | 'perfil_estudiante'
  ) {
    this.menuEstudianteAbierto = false;

    if (seccion === 'consulta_notas') {
      this.abrirConsultaNotas();

      this.cursoConsultaId = this.cursoEstudianteSeleccionadoId;
      this.hemiConsulta = this.hemisemestreActivo;
      this.nombreConsultaInput = this.nombrePerfilEstudiante;
    } else {
      if (seccion === 'panel_estudiante') {
        this.nombreEvaluadorInput = this.nombrePerfilEstudiante;
      }

      this.vistaActual = seccion;
    }

    this.cdr.detectChanges();
  }

  cerrarSesionEstudiantePanel() {
    this.loginPendiente = true;
    this.tipoLoginPrincipal = 'estudiante';

    this.usuarioLoginPrincipal = '';
    this.claveLoginPrincipal = '';
    this.claveEstudianteInput = '';
    this.cursoLoginPrincipalId = '';

    this.nombreEvaluadorInput = '';
    this.grupoEstudianteSeleccionadoId = null;
    this.cursoEstudianteSeleccionadoId = '';

    this.rubricaTemporalOral = {};

    this.rubricaTemporalCuestionario = {
      herramienta: 15,
      cantidad: 15
    };

    this.errorLoginPrincipal = '';
    this.resultadoConsulta = null;
    this.consultaRealizada = false;
    this.menuEstudianteAbierto = false;

    this.gruposCursoActual = [];
    this.vistaActual = 'portal_inicio';

    this.cdr.detectChanges();
  }

  volverPanelEstudiante() {
    this.abrirSeccionEstudiante('inicio_estudiante');
  }

  // ===== FIN NUEVO PANEL ESTUDIANTIL =====
  constructor(private cdr: ChangeDetectorRef) {}

  async ngOnInit() {
    await Promise.all([
      this.cargarConfiguracionGlobal(),
      this.cargarCursosConfig()
    ]);
    if (this.cursos.length > 0) {
      this.cursoDocenteSeleccionadoId = this.cursos[0].id;
      this.cursoConsultaId = this.cursos[0].id;
      await this.alCambiarCursoDocente();
    }
  }

  async cargarConfiguracionGlobal() {
    try {
      const docRef = doc(db, 'configuracion', 'global');
      const snap = await getDoc(docRef);
      if (snap.exists()) {
        const data = snap.data();
        this.correoDocenteCorrecto = String(
          data['correoDocente'] || ''
        ).trim().toLowerCase();
        this.hemisemestreActivo = data['hemisemestreActivo'] || 'hemisemestre_1';
        this.hemisemestreDocenteVista = this.hemisemestreActivo;
        this.hemiConsulta = this.hemisemestreActivo;
        if (data['claveDocente']) {
          this.claveDocenteCorrecta = data['claveDocente'];
        }
      } else {
        await setDoc(docRef, {
          hemisemestreActivo: 'hemisemestre_1',
          claveDocente: this.claveDocenteCorrecta
        });
      }
    } catch (e) {
      console.error('Error al cargar configuración:', e);
    }
  }

  async cargarCursosConfig() {
    try {
      const docRef = doc(db, 'configuracion', 'cursos_registrados');
      const snap = await getDoc(docRef);
      if (snap.exists() && snap.data()['cursos'] && snap.data()['cursos'].length > 0) {
        this.cursos = snap.data()['cursos'];
      } else {
        this.cursos = [...CURSOS_INICIALES];
        await setDoc(docRef, { cursos: this.cursos });
      }
    } catch (e) {
      this.cursos = [...CURSOS_INICIALES];
    }
  }

  async guardarCursosConfig() {
    const docRef = doc(db, 'configuracion', 'cursos_registrados');
    await setDoc(docRef, { cursos: this.cursos });
  }

  async cargarDatosCurso(cursoId: string, hemi: 'hemisemestre_1' | 'hemisemestre_2') {
    try {
      const docRef = doc(db, cursoId, hemi);
      const snap = await getDoc(docRef);
      if (snap.exists() && snap.data() && snap.data()['grupos']) {
        const gruposCargados: any[] = snap.data()['grupos'];
        for (const g of gruposCargados) {
          for (const est of g.integrantes) {
            if (!est.informe) est.informe = { formato: null, referencias: null, total: 0, comentarios: '' };
            if (!est.diapositivas) est.diapositivas = { formato: null, pertinencia: null, referencias: null, total: 0, comentarios: '' };
            if (!est.cuestionarioDocente) est.cuestionarioDocente = { referenciaPreguntas: null, coherenciaPreguntas: null, total: 0, comentarios: '' };
          }
        }
        this.gruposCursoActual = gruposCargados;
      } else {
        this.gruposCursoActual = [];
      }
    } catch (e) {
      console.error(`Error cargando curso ${cursoId}:`, e);
      this.gruposCursoActual = [];
    }
  }

  async guardarDatosCurso(cursoId: string, hemi: 'hemisemestre_1' | 'hemisemestre_2') {
    const docRef = doc(db, cursoId, hemi);
    await setDoc(docRef, { grupos: this.gruposCursoActual });
  }

  irA(vista: string) {
    this.vistaActual = vista;
    this.errorClaveDocente = false;
    this.errorClaveEstudiante = false;
    this.consultaRealizada = false;
    this.resultadoConsulta = null;
    this.cdr.detectChanges();
  }

  async agregarNuevoCurso() {
    if (!this.nuevoCursoNombre.trim() || !this.nuevoCursoParalelo.trim() || !this.nuevoCursoClave.trim()) {
      alert('Por favor completa todos los campos del nuevo curso.');
      return;
    }

    const idGenerado = `${this.nuevoCursoNombre.trim().toLowerCase().replace(/\s+/g, '_')}_${this.nuevoCursoParalelo.trim().toLowerCase()}`;
    if (this.cursos.some(c => c.id === idGenerado)) {
      alert('Ya existe un curso con este nombre y paralelo.');
      return;
    }

    const nuevo: CursoConfig = {
      id: idGenerado,
      nombre: this.nuevoCursoNombre.trim(),
      paralelo: this.nuevoCursoParalelo.trim().toUpperCase(),
      clave: this.nuevoCursoClave.trim()
    };

    this.cursos.push(nuevo);
    await this.guardarCursosConfig();

    this.nuevoCursoNombre = '';
    this.nuevoCursoParalelo = '';
    this.nuevoCursoClave = '';
    this.cdr.detectChanges();
    alert(`✅ Curso "${nuevo.nombre} - Paralelo ${nuevo.paralelo}" creado exitosamente.`);
  }

  async eliminarCurso(cursoId: string, nombreCompleto: string) {
    const confirmacion = confirm(`¿Estás seguro de que deseas eliminar el curso "${nombreCompleto}"?\n\nEsta acción quitará el acceso al paralelo.`);
    if (!confirmacion) return;

    this.cursos = this.cursos.filter(c => c.id !== cursoId);

    if (this.cursoDocenteSeleccionadoId === cursoId) {
      this.cursoDocenteSeleccionadoId = this.cursos.length > 0 ? this.cursos[0].id : '';
      await this.alCambiarCursoDocente();
    }

    await this.guardarCursosConfig();
    this.cdr.detectChanges();
    alert(`✅ El curso "${nombreCompleto}" ha sido eliminado exitosamente.`);
  }

  async actualizarClavesCursos() {
    await this.guardarCursosConfig();
    alert('✅ Contraseñas guardadas correctamente.');
  }

  async actualizarClaveDocente() {
    const nueva = this.nuevaClaveDocenteInput.trim();
    if (!nueva) {
      alert('Por favor ingresa una nueva contraseña para el docente.');
      return;
    }

    if (nueva.length < 6) {
      alert('Por seguridad, la contraseña debe tener al menos 6 caracteres.');
      return;
    }

    try {
      const docRef = doc(db, 'configuracion', 'global');
      await setDoc(docRef, {
        hemisemestreActivo: this.hemisemestreActivo,
        claveDocente: nueva
      }, { merge: true });

      this.claveDocenteCorrecta = nueva;
      this.nuevaClaveDocenteInput = '';
      this.cdr.detectChanges();
      alert('✅ Contraseña docente actualizada exitosamente.');
    } catch (error) {
      alert('Error al actualizar la contraseña: ' + error);
    }
  }

  async agregarGrupo() {
    if (!this.nuevoGrupoNombre.trim()) {
      alert('Ingresa el nombre del grupo.');
      return;
    }
    const nuevoId = this.gruposCursoActual.length > 0 ? Math.max(...this.gruposCursoActual.map(g => g.id)) + 1 : 1;
    const nuevoGrupo: Grupo = {
      id: nuevoId,
      nombre: this.nuevoGrupoNombre.trim(),
      integrantes: []
    };

    this.gruposCursoActual.push(nuevoGrupo);
    await this.guardarDatosCurso(this.cursoDocenteSeleccionadoId, this.hemisemestreDocenteVista);
    this.nuevoGrupoNombre = '';
    this.grupoDocenteId = nuevoId;
    this.alCambiarGrupoDocente(nuevoId);
    this.cdr.detectChanges();
    alert(`✅ ${nuevoGrupo.nombre} creado.`);
  }

  async agregarEstudianteAGrupo() {
    if (!this.grupoSeleccionadoParaEstudiante) {
      alert('Selecciona un grupo para asignar al estudiante.');
      return;
    }
    if (!this.nuevoEstudianteNombre.trim()) {
      alert('Ingresa el nombre del estudiante.');
      return;
    }

    const grupo = this.gruposCursoActual.find(g => g.id === Number(this.grupoSeleccionadoParaEstudiante));
    if (!grupo) return;

    const nuevoEst: Estudiante = {
      id: Date.now(),
      nombre: this.nuevoEstudianteNombre.trim(),
      rol: this.nuevoEstudianteRol,
      esLider: this.nuevoEstudianteEsLider,
      informe: { formato: null, referencias: null, total: 0, comentarios: '' },
      diapositivas: { formato: null, pertinencia: null, referencias: null, total: 0, comentarios: '' },
      cuestionarioDocente: { referenciaPreguntas: null, coherenciaPreguntas: null, total: 0, comentarios: '' },
      votosOral: [],
      votosCuestionario: [],
      promedioCoevaluacion: 0,
      notaFinal: 0
    };

    grupo.integrantes.push(nuevoEst);
    await this.guardarDatosCurso(this.cursoDocenteSeleccionadoId, this.hemisemestreDocenteVista);

    this.nuevoEstudianteNombre = '';
    this.nuevoEstudianteEsLider = false;
    this.cdr.detectChanges();
    alert(`✅ Estudiante agregado a ${grupo.nombre}.`);
  }

  async eliminarEstudiante(grupoId: number, estId: number) {
    if (!confirm('¿Seguro que deseas eliminar a este estudiante?')) return;
    const grupo = this.gruposCursoActual.find(g => g.id === grupoId);
    if (grupo) {
      grupo.integrantes = grupo.integrantes.filter(e => e.id !== estId);
      if (this.estudianteSeleccionadoId === estId) {
        this.estudianteSeleccionadoId = null;
        this.limpiarFormularioDocente();
      }
      this.recalcularNotasGrupo(grupo);
      await this.guardarDatosCurso(this.cursoDocenteSeleccionadoId, this.hemisemestreDocenteVista);
      this.cdr.detectChanges();
    }
  }

  
async iniciarSesionDocente() {

  if (this.claveDocenteInput === this.claveDocenteCorrecta) {

    this.errorClaveDocente = false;

    // Mostrar la bienvenida del docente
    this.inicioDocente = true;
    this.vistaActual = 'panel_docente';

    // Preparar el curso inicial
    if (this.cursos.length > 0) {
      this.cursoDocenteSeleccionadoId = this.cursos[0].id;
    }

    this.cargandoDatosDocente = this.cursos.length > 0;
    this.errorCargaDocente = '';

    this.cdr.detectChanges();

    // Cargar los datos sin bloquear la bienvenida
    if (this.cursos.length > 0) {

      void this.alCambiarCursoDocente()
        .then(() => {
          this.cargandoDatosDocente = false;
          this.cdr.detectChanges();
        })
        .catch(error => {
          console.error('Error cargando datos del docente:', error);

          this.errorCargaDocente =
            'No se pudieron cargar los datos del curso.';

          this.cargandoDatosDocente = false;
          this.cdr.detectChanges();
        });
    }

  } else {
    this.errorClaveDocente = true;
  }
}


  cerrarSesionDocente() {
     this.claveDocenteInput = '';
  this.vistaActual = 'portal_inicio';
   this.loginPendiente = true;

  // NUEVO: Limpiar los campos de acceso
  this.usuarioLoginPrincipal = '';
  this.claveLoginPrincipal = '';
  this.errorLoginPrincipal = '';

  // NUEVO: Mostrar nuevamente el acceso docente
  this.tipoLoginPrincipal = 'docente';
  this.cdr.detectChanges();

  }

  async cambiarHemiActivoDocente(hemi: 'hemisemestre_1' | 'hemisemestre_2') {
    this.hemisemestreActivo = hemi;
    await setDoc(doc(db, 'configuracion', 'global'), { hemisemestreActivo: hemi }, { merge: true });
    this.cdr.detectChanges();
    alert(`📢 Se ha activado el "${hemi === 'hemisemestre_1' ? '1er Hemisemestre' : '2do Hemisemestre'}" para todos los estudiantes.`);
  }

  async alCambiarHemiDocenteVista(hemi: 'hemisemestre_1' | 'hemisemestre_2') {
    this.hemisemestreDocenteVista = hemi;
    await this.alCambiarCursoDocente();
  }

  async alCambiarCursoDocente(nuevoCursoId?: string) {
    if (nuevoCursoId) {
      this.cursoDocenteSeleccionadoId = nuevoCursoId;
    }

    this.limpiarFormularioDocente();
    this.grupoDocenteId = null;
    this.estudianteSeleccionadoId = null;
    this.grupoSeleccionadoParaEstudiante = null;

    await this.cargarDatosCurso(this.cursoDocenteSeleccionadoId, this.hemisemestreDocenteVista);

    if (this.gruposCursoActual && this.gruposCursoActual.length > 0) {
      this.grupoDocenteId = this.gruposCursoActual[0].id;
      this.grupoSeleccionadoParaEstudiante = this.gruposCursoActual[0].id;
      this.alCambiarGrupoDocente(this.grupoDocenteId);
    } else {
      this.grupoDocenteId = null;
      this.grupoSeleccionadoParaEstudiante = null;
      this.limpiarFormularioDocente();
    }

    this.cdr.detectChanges();
  }

  alCambiarGrupoDocente(grupoId: any) {
    this.grupoDocenteId = Number(grupoId);
    const grupo = this.grupoSeleccionadoDocente;
    if (grupo && grupo.integrantes.length > 0) {
      this.seleccionarEstudianteParaCalificar(grupo.integrantes[0].id);
    } else {
      this.estudianteSeleccionadoId = null;
      this.limpiarFormularioDocente();
    }
    this.cdr.detectChanges();
  }

  get grupoSeleccionadoDocente(): Grupo | undefined {
    return this.gruposCursoActual.find(g => Number(g.id) === Number(this.grupoDocenteId));
  }

  get estudianteSeleccionadoDocente(): Estudiante | undefined {
    const grupo = this.grupoSeleccionadoDocente;
    if (!grupo) return undefined;
    return grupo.integrantes.find(e => Number(e.id) === Number(this.estudianteSeleccionadoId));
  }

  seleccionarEstudianteParaCalificar(estudianteId: number) {
    this.estudianteSeleccionadoId = Number(estudianteId);
    const est = this.estudianteSeleccionadoDocente;
    if (est) {
      this.docenteInformeFormato = est.informe?.formato ?? null;
      this.docenteInformeReferencias = est.informe?.referencias ?? null;
      this.docenteInformeComentarios = est.informe?.comentarios || '';

      this.docenteDiapositivasFormato = est.diapositivas?.formato ?? null;
      this.docenteDiapositivasPertinencia = est.diapositivas?.pertinencia ?? null;
      this.docenteDiapositivasReferencias = est.diapositivas?.referencias ?? null;
      this.docenteDiapositivasComentarios = est.diapositivas?.comentarios || '';

      this.docenteCuestionarioReferencia = est.cuestionarioDocente?.referenciaPreguntas ?? null;
      this.docenteCuestionarioCoherencia = est.cuestionarioDocente?.coherenciaPreguntas ?? null;
      this.docenteCuestionarioComentarios = est.cuestionarioDocente?.comentarios || '';
    } else {
      this.limpiarFormularioDocente();
    }
    this.cdr.detectChanges();
  }

  limpiarFormularioDocente() {
    this.docenteInformeFormato = null;
    this.docenteInformeReferencias = null;
    this.docenteInformeComentarios = '';

    this.docenteDiapositivasFormato = null;
    this.docenteDiapositivasPertinencia = null;
    this.docenteDiapositivasReferencias = null;
    this.docenteDiapositivasComentarios = '';

    this.docenteCuestionarioReferencia = null;
    this.docenteCuestionarioCoherencia = null;
    this.docenteCuestionarioComentarios = '';
  }

  async guardarNotasIndividualesDocente() {
    const est = this.estudianteSeleccionadoDocente;
    const g = this.grupoSeleccionadoDocente;

    if (!est || !g) {
      alert('Por favor selecciona un estudiante para guardar su calificación.');
      return;
    }

    est.informe = {
      formato: Number(this.docenteInformeFormato || 0),
      referencias: Number(this.docenteInformeReferencias || 0),
      total: Number(this.docenteInformeFormato || 0) + Number(this.docenteInformeReferencias || 0),
      comentarios: this.docenteInformeComentarios.trim()
    };

    if (est.rol === 'Expositor') {
      est.diapositivas = {
        formato: Number(this.docenteDiapositivasFormato || 0),
        pertinencia: Number(this.docenteDiapositivasPertinencia || 0),
        referencias: Number(this.docenteDiapositivasReferencias || 0),
        total: Number(this.docenteDiapositivasFormato || 0) + Number(this.docenteDiapositivasPertinencia || 0) + Number(this.docenteDiapositivasReferencias || 0),
        comentarios: this.docenteDiapositivasComentarios.trim()
      };
    } else {
      est.cuestionarioDocente = {
        referenciaPreguntas: Number(this.docenteCuestionarioReferencia || 0),
        coherenciaPreguntas: Number(this.docenteCuestionarioCoherencia || 0),
        total: Number(this.docenteCuestionarioReferencia || 0) + Number(this.docenteCuestionarioCoherencia || 0),
        comentarios: this.docenteCuestionarioComentarios.trim()
      };
    }

    this.recalcularNotasGrupo(g);
    await this.guardarDatosCurso(this.cursoDocenteSeleccionadoId, this.hemisemestreDocenteVista);
    this.cdr.detectChanges();
    alert(`✅ Calificación individual guardada exitosamente para ${est.nombre}.`);
  }

  recalcularNotasGrupo(grupo: Grupo) {
    for (const est of grupo.integrantes) {
      const totalInforme = est.informe?.total || 0;

      if (est.rol === 'Expositor') {
        const totalDiap = est.diapositivas?.total || 0;
        if (est.votosOral && est.votosOral.length > 0) {
          const suma = est.votosOral.reduce((acc, v) => acc + v.total, 0);
          est.promedioCoevaluacion = Number((suma / est.votosOral.length).toFixed(2));
        } else {
          est.promedioCoevaluacion = 0;
        }
        est.notaFinal = Number((totalInforme + totalDiap + est.promedioCoevaluacion).toFixed(2));
      } else {
        const totalCuest = est.cuestionarioDocente?.total || 0;
        if (est.votosCuestionario && est.votosCuestionario.length > 0) {
          const suma = est.votosCuestionario.reduce((acc, v) => acc + v.total, 0);
          est.promedioCoevaluacion = Number((suma / est.votosCuestionario.length).toFixed(2));
        } else {
          est.promedioCoevaluacion = 0;
        }
        est.notaFinal = Number((totalInforme + totalCuest + est.promedioCoevaluacion).toFixed(2));
      }
    }
  }

  exportarPDF() {
    const cursoObj = this.cursos.find(c => c.id === this.cursoDocenteSeleccionadoId);
    const cursoNombre = cursoObj ? `${cursoObj.nombre} - Paralelo "${cursoObj.paralelo}"` : this.cursoDocenteSeleccionadoId;
    const hemiTexto = this.hemisemestreDocenteVista === 'hemisemestre_1' ? '1er Hemisemestre' : '2do Hemisemestre';
    const fechaImpresion = new Date().toLocaleDateString('es-EC', { year: 'numeric', month: 'long', day: 'numeric' });

    let filasHtml = '';
    for (const g of this.gruposCursoActual) {
      for (let i = 0; i < g.integrantes.length; i++) {
        const est = g.integrantes[i];
        const cantVotos = est.rol === 'Expositor' ? (est.votosOral?.length || 0) : (est.votosCuestionario?.length || 0);

        filasHtml += `
          <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
            ${i === 0 ? `<td rowspan="${g.integrantes.length}" style="padding: 8px; font-weight: bold; border-right: 1px solid #e2e8f0; vertical-align: top; background: #f8fafc;">${g.nombre}</td>` : ''}
            <td style="padding: 7px 8px;">
              ${est.nombre} ${est.esLider ? '<span style="color: #1e40af; font-weight: bold;">(Líder)</span>' : ''}
            </td>
            <td style="padding: 7px 8px; text-align: center; color: ${est.rol === 'Expositor' ? '#047857' : '#b45309'}; font-weight: 600;">
              ${est.rol}
            </td>
            <td style="padding: 7px 8px; text-align: center;">${cantVotos}</td>
            <td style="padding: 7px 8px; text-align: right; font-weight: 600; color: #047857;">${est.promedioCoevaluacion.toFixed(2)}</td>
            <td style="padding: 7px 8px; text-align: right; font-weight: bold; color: #1e40af; font-size: 12px;">${est.notaFinal.toFixed(2)}</td>
            <td style="padding: 6px 8px; font-size: 9.5px; color: #475569; vertical-align: top; line-height: 1.35; border-left: 1px solid #e2e8f0; max-width: 250px;">
              ${est.informe?.comentarios ? `<div><b>Inf:</b> ${est.informe.comentarios}</div>` : ''}
              ${est.diapositivas?.comentarios ? `<div><b>Diap:</b> ${est.diapositivas.comentarios}</div>` : ''}
              ${est.cuestionarioDocente?.comentarios ? `<div><b>Cuest:</b> ${est.cuestionarioDocente.comentarios}</div>` : ''}
              ${!est.informe?.comentarios && !est.diapositivas?.comentarios && !est.cuestionarioDocente?.comentarios ? '<i style="color:#94a3b8">Sin observaciones</i>' : ''}
            </td>
          </tr>
        `;
      }
    }

    const ventana = window.open('', '_blank');
    if (!ventana) {
      alert('Por favor habilita las ventanas emergentes en tu navegador.');
      return;
    }

    ventana.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>EVADEX - Reporte Oficial de Calificaciones</title>
        <style>
          @page { size: A4 portrait; margin: 12mm 15mm 12mm 15mm; }
          body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; margin: 0; padding: 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th { background-color: #1e3a8a; color: white; font-size: 10.5px; font-weight: 700; padding: 8px 6px; text-align: left; text-transform: uppercase; }
          @media print { .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="no-print" style="background: #eff6ff; border-bottom: 1px solid #bfdbfe; padding: 10px 15px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
          <span style="font-size: 13px; color: #1e40af; font-weight: 600;">EVADEX - Reporte Oficial para Imprimir o Guardar en PDF</span>
          <button onclick="window.print()" style="background: #1e40af; color: white; border: none; padding: 8px 18px; border-radius: 6px; font-weight: bold; cursor: pointer; font-size: 13px;">
            🖨️ Guardar como PDF
          </button>
        </div>

        <div style="border-bottom: 2px solid #1e3a8a; padding-bottom: 10px; margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 15px;">
            <img src="/LOGO_UTMACH-removebg-preview.png" alt="UTMACH" style="height: 65px; width: auto; object-fit: contain;">
            <div>
              <h2 style="margin: 0; font-size: 16px; color: #1e3a8a; text-transform: uppercase;">Universidad Técnica de Machala</h2>
              <h3 style="margin: 2px 0 0 0; font-size: 13px; color: #475569; font-weight: 600;">EVADEX | Rúbricas Oficiales de Evaluación Individual de Exposiciones y Evaluadores</h3>
            </div>
          </div>
          <div style="text-align: right; font-size: 10.5px; color: #64748b;">
            <div><b>Fecha:</b> ${fechaImpresion}</div>
            <div><b>Docente:</b> Ing. Johnny Paul Novillo Vicuña</div>
          </div>
        </div>

        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 14px; display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 10px;">
          <div><b>Curso:</b> ${cursoNombre}</div>
          <div><b>Periodo:</b> <span style="color: #1e40af; font-weight: bold;">${hemiTexto}</span></div>
          <div><b>Total Estudiantes:</b> ${this.gruposCursoActual.reduce((acc, g) => acc + g.integrantes.length, 0)}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 13%;">Grupo</th>
              <th style="width: 32%;">Nómina de Estudiantes</th>
              <th style="width: 11%; text-align: center;">Rol</th>
              <th style="width: 8%; text-align: center;">Votos</th>
              <th style="width: 10%; text-align: right;">Pares (30%)</th>
              <th style="width: 11%; text-align: right;">Nota Final</th>
              <th style="width: 15%; border-left: 1px solid rgba(255,255,255,0.2);">Observaciones</th>
            </tr>
          </thead>
          <tbody>
            ${filasHtml}
          </tbody>
        </table>

        <div style="margin-top: 55px; display: flex; justify-content: space-around; font-size: 11.5px; text-align: center;">
          <div style="width: 240px; border-top: 1px solid #334155; padding-top: 6px;">
            <b>Ing. Johnny Paul Novillo Vicuña</b><br>
            <span style="color: #64748b; font-size: 10px;">Docente de Cátedra</span>
          </div>
          <div style="width: 240px; border-top: 1px solid #334155; padding-top: 6px;">
            <b>Dirección de Carrera</b><br>
            <span style="color: #64748b; font-size: 10px;">UTMACH</span>
          </div>
        </div>

        <script>
          window.onload = function() { setTimeout(function() { window.print(); }, 400); }
        </script>
      </body>
      </html>
    `);
    ventana.document.close();
  }

  async abrirLoginEstudiante(cursoId: string) {
    this.cursoEstudianteSeleccionadoId = cursoId;
    this.claveEstudianteInput = '';
    this.errorClaveEstudiante = false;
    // Carga rápida directa sin llamadas redundantes
    await this.cargarDatosCurso(cursoId, this.hemisemestreActivo);
    this.vistaActual = 'login_estudiante';
    this.cdr.detectChanges();
  }

  get cursoEstudianteActivo(): CursoConfig | undefined {
    return this.cursos.find(c => c.id === this.cursoEstudianteSeleccionadoId);
  }

  iniciarSesionEstudiante() {
    const curso = this.cursoEstudianteActivo;
    if (curso && this.claveEstudianteInput.trim() === curso.clave) {
      this.errorClaveEstudiante = false;
      this.nombreEvaluadorInput = '';
      this.grupoEstudianteSeleccionadoId = null;
      this.vistaActual = 'panel_estudiante';
      this.cdr.detectChanges();
    } else {
      this.errorClaveEstudiante = true;
    }
  }

  get grupoEstudianteSeleccionado(): Grupo | undefined {
    return this.gruposCursoActual.find(g => g.id === Number(this.grupoEstudianteSeleccionadoId));
  }

  
  // ===== RECONOCIMIENTO FLEXIBLE DE ESTUDIANTES =====

  coincideNombreEstudiante(
    nombreIngresado: string,
    nombreRegistrado: string
  ): boolean {

    const limpiar = (texto: string): string[] =>
      this.normalizarTexto(texto)
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(Boolean);

    const ingresado = limpiar(nombreIngresado);
    const registrado = limpiar(nombreRegistrado);

    // Se requieren al menos dos palabras.
    if (ingresado.length < 2) return false;

    // No permitir palabras que no estén en el registro.
    if (!ingresado.every(p => registrado.includes(p))) {
      return false;
    }

    // Evitar que una palabra se reutilice varias veces.
    const disponibles = [...registrado];

    for (const palabra of ingresado) {
      const indice = disponibles.indexOf(palabra);

      if (indice === -1) return false;

      disponibles.splice(indice, 1);
    }

    return true;
  }

  // ===== FIN RECONOCIMIENTO FLEXIBLE =====

  normalizarTexto(texto: string): string {
    return (texto || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  get evaluadorPerteneceAlGrupo(): boolean {
    if (!this.grupoEstudianteSeleccionado || !this.nombreEvaluadorInput.trim()) return false;

    const palabrasIngresadas = this.normalizarTexto(this.nombreEvaluadorInput)
      .split(/\s+/)
      .filter(palabra => palabra.length >= 3);

    if (palabrasIngresadas.length === 0) return false;

    const umbralCoincidencias = palabrasIngresadas.length >= 2 ? 2 : 1;

    return this.grupoEstudianteSeleccionado.integrantes.some(est => {
      const palabrasIntegrante = this.normalizarTexto(est.nombre)
        .split(/\s+/)
        .filter(palabra => palabra.length >= 3);

      const coincidencias = palabrasIngresadas.filter(pIngresada =>
        palabrasIntegrante.some(pIntegrante => pIntegrante.includes(pIngresada) || pIngresada.includes(pIntegrante))
      ).length;

      return coincidencias >= umbralCoincidencias;
    });
  }

  get expositoresDelGrupo(): Estudiante[] {
    if (!this.grupoEstudianteSeleccionado || this.evaluadorPerteneceAlGrupo) return [];
    return this.grupoEstudianteSeleccionado.integrantes.filter(est => est.rol === 'Expositor');
  }

  get evaluadorDesignadoDelGrupo(): Estudiante | undefined {
    if (!this.grupoEstudianteSeleccionado || this.evaluadorPerteneceAlGrupo) return undefined;
    return this.grupoEstudianteSeleccionado.integrantes.find(est => est.rol === 'Evaluador');
  }

  alCambiarGrupo() {
    this.rubricaTemporalOral = {};
    this.rubricaTemporalCuestionario = { herramienta: 15, cantidad: 15 };
    if (this.grupoEstudianteSeleccionado) {
      for (const est of this.grupoEstudianteSeleccionado.integrantes) {
        if (est.rol === 'Expositor') {
          this.rubricaTemporalOral[est.id] = { lectura: 15, claridad: 15 };
        }
      }
    }
    this.cdr.detectChanges();
  }

  // ENVÍO ULTRA RÁPIDO CON PROTECCIÓN DE CONCURRENCIA
  
async enviarEvaluacionEstudiante() {

  // Evitar varios clics seguidos en Guardar
  if (this.guardandoEnProceso) return;

  const evaluador = this.nombreEvaluadorInput.trim();

  if (!evaluador) {
    alert('Por favor ingresa tu nombre antes de calificar.');
    return;
  }

  if (!this.grupoEstudianteSeleccionadoId) {
    alert('Por favor selecciona el grupo a calificar.');
    return;
  }

  if (this.evaluadorPerteneceAlGrupo) {
    alert(
      `Acción no permitida: ${evaluador} pertenece a este grupo. No puedes autoevaluarte.`
    );
    return;
  }

  this.guardandoEnProceso = true;

  const cursoId = this.cursoEstudianteSeleccionadoId;
  const hemisemestre = this.hemisemestreActivo;
  const grupoId = Number(this.grupoEstudianteSeleccionadoId);

  const nombreNormalizado = this.normalizarTexto(evaluador)
    .replace(/\s+/g, ' ');

  const docRef = doc(db, cursoId, hemisemestre);

  try {

    // Ejecutar lectura, comprobación y guardado
    // dentro de una transacción de Firestore.
    const resultado = await runTransaction(db, async transaction => {

      const snap = await transaction.get(docRef);

      if (!snap.exists()) {
        throw new Error(
          'No se encontraron los datos del curso en Firebase.'
        );
      }

      const datos = snap.data();

      if (!Array.isArray(datos['grupos'])) {
        throw new Error(
          'No existen grupos registrados para este periodo.'
        );
      }

      const gruposVigentes: Grupo[] = datos['grupos'];

      const grupoTarget = gruposVigentes.find(
        g => Number(g.id) === grupoId
      );

      if (!grupoTarget) {
        throw new Error(
          'El grupo seleccionado no fue encontrado.'
        );
      }

      // ===== 1. COMPROBAR SI YA EVALUÓ =====

      const yaEvaluo = grupoTarget.integrantes.some(est => {

        const votosOral = est.votosOral || [];
        const votosCuestionario = est.votosCuestionario || [];

        const votoOralExistente = votosOral.some(v =>
          this.normalizarTexto(v.evaluadorNombre)
            .replace(/\s+/g, ' ') === nombreNormalizado
        );

        const votoCuestionarioExistente = votosCuestionario.some(v =>
          this.normalizarTexto(v.evaluadorNombre)
            .replace(/\s+/g, ' ') === nombreNormalizado
        );

        return votoOralExistente || votoCuestionarioExistente;

      });

      if (yaEvaluo) {
        throw new Error(
          'GRUPO_YA_EVALUADO'
        );
      }

      // ===== 2. REGISTRAR LOS EXPOSITORES =====

      const expositores = grupoTarget.integrantes.filter(
        est => est.rol === 'Expositor'
      );

      for (const est of expositores) {

        const datosRubrica =
          this.rubricaTemporalOral[est.id] ||
          { lectura: 15, claridad: 15 };

        if (!est.votosOral) {
          est.votosOral = [];
        }

        // Agregar el primer voto, sin reemplazar ninguno.
        est.votosOral.push({
          evaluadorNombre: evaluador,
          lectura: Number(datosRubrica.lectura),
          claridad: Number(datosRubrica.claridad),
          total:
            Number(datosRubrica.lectura) +
            Number(datosRubrica.claridad)
        });

      }

      // ===== 3. REGISTRAR AL EVALUADOR =====

      const evaluadorAsignado = grupoTarget.integrantes.find(
        est => est.rol === 'Evaluador'
      );

      if (evaluadorAsignado) {

        if (!evaluadorAsignado.votosCuestionario) {
          evaluadorAsignado.votosCuestionario = [];
        }

        evaluadorAsignado.votosCuestionario.push({
          evaluadorNombre: evaluador,
          herramienta: Number(
            this.rubricaTemporalCuestionario.herramienta
          ),
          cantidad: Number(
            this.rubricaTemporalCuestionario.cantidad
          ),
          total:
            Number(this.rubricaTemporalCuestionario.herramienta) +
            Number(this.rubricaTemporalCuestionario.cantidad)
        });

      }

      // ===== 4. RECALCULAR NOTAS =====

      this.recalcularNotasGrupo(grupoTarget);

      // ===== 5. GUARDAR EN FIREBASE =====

      transaction.update(docRef, {
        grupos: gruposVigentes
      });

      return {
        grupos: gruposVigentes,
        nombreGrupo: grupoTarget.nombre
      };

    });

    // ===== 6. ACTUALIZAR LA INTERFAZ =====

    this.gruposCursoActual = resultado.grupos;

    const hemiTexto =
      hemisemestre === 'hemisemestre_1'
        ? '1er Hemisemestre'
        : '2do Hemisemestre';

    alert(
      `✅ ¡CALIFICACIÓN REGISTRADA!\n\n` +
      `Evaluador: ${evaluador}\n` +
      `Grupo evaluado: ${resultado.nombreGrupo}\n` +
      `Periodo: ${hemiTexto}\n\n` +
      `Tu evaluación fue registrada y no podrás modificarla mediante otro envío.`
    );

    // Mantener el nombre del estudiante durante la sesión
    this.nombreEvaluadorInput = evaluador;

    // Limpiar únicamente el grupo seleccionado
    this.grupoEstudianteSeleccionadoId = null;

    // Regresar al panel estudiantil
    this.vistaActual = 'inicio_estudiante';

  } catch (error) {

    const mensaje =
      error instanceof Error ? error.message : String(error);

    if (mensaje === 'GRUPO_YA_EVALUADO') {

      alert(
        '🔒 GRUPO YA EVALUADO\n\n' +
        'Ya registraste tu coevaluación para este grupo.\n\n' +
        'No puedes evaluarlo nuevamente ni modificar las notas enviadas.'
      );

    } else {

      console.error('Error guardando coevaluación:', error);

      alert(
        'No se pudo registrar la evaluación: ' + mensaje
      );

    }

  } finally {

    this.guardandoEnProceso = false;
    this.cdr.detectChanges();

  }
}


  abrirConsultaNotas() {
    this.nombreConsultaInput = '';
    this.resultadoConsulta = null;
    this.consultaRealizada = false;
    if (this.cursos.length > 0) this.cursoConsultaId = this.cursos[0].id;
    this.hemiConsulta = this.hemisemestreActivo;
    this.vistaActual = 'consulta_notas';
    this.cdr.detectChanges();
  }

  async buscarNotaEstudiante() {
    const busqueda = this.normalizarTexto(this.nombreConsultaInput);
    if (!busqueda || busqueda.length < 3) {
      alert('Ingresa al menos 3 letras de tu nombre para buscar.');
      return;
    }

    try {
      const docRef = doc(db, this.cursoConsultaId, this.hemiConsulta);
      const snap = await getDoc(docRef);
      this.consultaRealizada = true;
      this.resultadoConsulta = null;

      if (snap.exists() && snap.data()['grupos']) {
        const grupos: Grupo[] = snap.data()['grupos'];
        for (const g of grupos) {
          const estEncontrado = g.integrantes.find(e => this.normalizarTexto(e.nombre).includes(busqueda));
          if (estEncontrado) {
            this.resultadoConsulta = { estudiante: estEncontrado, grupo: g };
            this.cdr.detectChanges();
            return;
          }
        }
      }
      this.cdr.detectChanges();
    } catch (e) {
      console.error(e);
      alert('Error consultando calificaciones.');
    }
  }
}