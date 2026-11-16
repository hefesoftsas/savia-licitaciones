// Mensajes estáticos para errores de entrada; nunca contienen respuestas del proveedor.
export class TaskInputError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TaskInputError';
  }
}
