# Guía de Contribución

## Índice
1. [Código de Conducta](#código-de-conducta)
2. [Cómo Contribuir](#cómo-contribuir)
3. [Flujo de Trabajo](#flujo-de-trabajo)
4. [Estándares de Código](#estándares-de-código)
5. [Pull Requests](#pull-requests)
6. [Reportar Bugs](#reportar-bugs)
7. [Solicitar Features](#solicitar-features)

---

## Código de Conducta

### Nuestros Valores

- **Respeto**: Tratar a todos con respeto y consideración
- **Colaboración**: Trabajar juntos hacia objetivos comunes
- **Inclusión**: Crear un ambiente inclusivo para todos
- **Calidad**: Mantener altos estándares de calidad

### Comportamiento Esperado

- Usar lenguaje inclusivo y respetuoso
- Aceptar críticas constructivas
- Enfocarse en lo que es mejor para la comunidad
- Mostrar empatía hacia otros

### Comportamiento Inaceptable

- Uso de lenguaje o imágenes sexualizadas
- Trolling, insultos, ataques personales
- Acoso público o privado
- Publicar información privada de otros

---

## Cómo Contribuir

### Tipos de Contribuciones

- 🐛 **Bug Fixes**: Corregir errores
- ✨ **Features**: Nuevas funcionalidades
- 📚 **Documentation**: Mejorar documentación
- 🧪 **Tests**: Agregar o mejorar tests
- 🔧 **Refactoring**: Mejorar código existente
- ⚡ **Performance**: Optimizaciones

### Primeros Pasos

1. **Fork el repositorio**
   ```bash
   git clone https://github.com/tu-usuario/ecommerce-platform.git
   cd ecommerce-platform
   ```

2. **Configurar el entorno**
   ```bash
   npm install
   make setup
   make start
   ```

3. **Crear una rama**
   ```bash
   git checkout -b feature/tu-feature
   # o
   git checkout -b fix/tu-bugfix
   ```

---

## Flujo de Trabajo

### Convención de Branches

```
main                    # Producción
├── develop             # Desarrollo
├── feature/XXX-123     # Features
├── fix/XXX-456         # Bug fixes
├── hotfix/XXX-789      # Hotfixes urgentes
└── release/v1.2.0      # Releases
```

### Commits

#### Formato de Commit

```
<type>(<scope>): <subject>

<body>

<footer>
```

#### Tipos de Commit

| Tipo | Descripción |
|------|-------------|
| `feat` | Nueva funcionalidad |
| `fix` | Corrección de bug |
| `docs` | Cambios en documentación |
| `style` | Cambios de formato (no afectan código) |
| `refactor` | Refactoring de código |
| `perf` | Mejoras de performance |
| `test` | Agregar o modificar tests |
| `chore` | Tareas de mantenimiento |

#### Ejemplos

```bash
# Feature
feat(auth): add OAuth2 login support

# Bug fix
fix(cart): resolve race condition in checkout

# Documentation
docs(api): update authentication endpoints

# Refactoring
refactor(products): extract validation logic
```

### Proceso de Desarrollo

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│    Fork     │───►│   Branch    │───►│   Develop   │───►│    Test     │
│             │    │             │    │             │    │             │
└─────────────┘    └─────────────┘    └─────────────┘    └──────┬──────┘
                                                                 │
                                                                 ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│    Merge    │◄───│    Code     │◄───│    Push     │◄───│   Commit    │
│             │    │   Review    │    │             │    │             │
└─────────────┘    └─────────────┘    └─────────────┘    └─────────────┘
```

---

## Estándares de Código

### TypeScript

```typescript
// ✅ DO: Usar tipos explícitos
interface User {
  id: string;
  email: string;
}

function getUser(id: string): Promise<User> {
  // implementation
}

// ❌ DON'T: Usar any
function getUser(id: any): any {
  // implementation
}
```

### Nomenclatura

| Elemento | Convención | Ejemplo |
|----------|------------|---------|
| Clases | PascalCase | `UserService` |
| Interfaces | PascalCase con I | `IUserRepository` |
| Funciones | camelCase | `getUserById` |
| Constantes | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| Archivos | kebab-case | `user-service.ts` |

### Linting

```bash
# Ejecutar linter
npm run lint

# Corregir automáticamente
npm run lint:fix

# Verificar tipos
npm run type-check
```

### Formato

```bash
# Formatear código
npm run format

# Verificar formato
npm run format:check
```

---

## Pull Requests

### Checklist

```
□ Código
  □ Compila sin errores
  □ Tests pasan
  □ Linting pasa
  □ Sin console.log

□ Testing
  □ Tests unitarios agregados
  □ Tests de integración (si aplica)
  □ Cobertura > 80%

□ Documentación
  □ README actualizado
  □ API docs actualizadas
  □ CHANGELOG actualizado

□ PR
  □ Título descriptivo
  □ Descripción clara
  □ Referencia a issue (si aplica)
```

### Template de PR

```markdown
## Descripción
Breve descripción de los cambios

## Tipo de cambio
- [ ] Bug fix
- [ ] Nueva funcionalidad
- [ ] Breaking change
- [ ] Documentación

## Cómo probar
1. Paso 1
2. Paso 2
3. Resultado esperado

## Screenshots (si aplica)

## Checklist
- [ ] Tests agregados
- [ ] Documentación actualizada
- [ ] Código revisado

## Referencias
- Fixes #123
- Relates to #456
```

### Proceso de Review

1. **Automated Checks**
   - CI/CD pipeline pasa
   - Tests pasan
   - Cobertura suficiente
   - Sin vulnerabilidades

2. **Code Review**
   - Mínimo 2 aprobaciones
   - Resolver comentarios
   - Mantener conversación constructiva

3. **Merge**
   - Squash and merge
   - Eliminar branch después

---

## Reportar Bugs

### Template de Bug Report

```markdown
**Descripción**
Descripción clara del bug

**Pasos para reproducir**
1. Ir a '...'
2. Click en '...'
3. Ver error

**Comportamiento esperado**
Qué debería pasar

**Screenshots**
Si aplica

**Entorno**
- OS: [e.g. macOS 14]
- Node: [e.g. 18.12.0]
- Browser: [e.g. Chrome 120]

**Logs**
```
Error logs aquí
```

**Información adicional**
Cualquier otra información relevante
```

### Buenas Prácticas

- Buscar issues existentes antes de crear uno nuevo
- Usar labels apropiados
- Ser específico en la descripción
- Incluir pasos de reproducción
- Agregar screenshots si aplica

---

## Solicitar Features

### Template de Feature Request

```markdown
**Descripción**
Descripción clara de la funcionalidad

**Problema que resuelve**
¿Qué problema resuelve esta feature?

**Solución propuesta**
Descripción de la solución

**Alternativas consideradas**
Otras soluciones consideradas

**Información adicional**
Cualquier otra información relevante
```

---

## Recursos

### Documentación
- [Architecture Overview](../architecture/ARCHITECTURE_OVERVIEW.md)
- [Development Guide](DEVELOPMENT_GUIDE.md)
- [API Specification](../architecture/API_SPECIFICATION.md)

### Comandos Útiles

```bash
# Setup
make setup

# Desarrollo
make dev

# Tests
make test
make test:watch

# Lint
make lint
make lint:fix

# Build
make build
```

### Contacto

- GitHub Discussions: https://github.com/company/ecommerce-platform/discussions
- Slack: #ecommerce-platform
- Email: dev@company.com

---

## Licencia

Al contribuir, aceptas que tus contribuciones serán licenciadas bajo la misma licencia MIT que el proyecto.

---

¡Gracias por contribuir! 🎉
