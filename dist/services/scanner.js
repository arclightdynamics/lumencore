import fs from 'fs';
import path from 'path';
const KEY_FILES = [
    'package.json',
    'README.md',
    'tsconfig.json',
    'pyproject.toml',
    'Cargo.toml',
    'go.mod',
    'requirements.txt',
    'Makefile',
    'docker-compose.yml',
    'Dockerfile',
    '.env.example',
];
const IGNORE_DIRS = [
    'node_modules',
    '.git',
    'dist',
    'build',
    '__pycache__',
    '.venv',
    'venv',
    'target',
    'vendor',
];
export class ProjectScanner {
    projectPath;
    memoryService;
    constructor(projectPath, memoryService) {
        this.projectPath = projectPath;
        this.memoryService = memoryService;
    }
    async scan() {
        const results = [];
        // Get project name
        const projectName = path.basename(this.projectPath);
        results.push(`Scanning project: ${projectName}`);
        // Scan directory structure
        const structure = this.getDirectoryStructure(this.projectPath, 3);
        this.memoryService.create({
            category: 'concept',
            title: 'Project Structure',
            content: `Directory structure for ${projectName}:\n\n${structure}`,
            tags: ['auto-generated', 'structure'],
            importance: 4,
        });
        results.push('- Captured project structure');
        // Scan key files
        for (const keyFile of KEY_FILES) {
            const filePath = path.join(this.projectPath, keyFile);
            if (fs.existsSync(filePath)) {
                const content = this.readFileSafe(filePath);
                if (content) {
                    const summary = this.summarizeFile(keyFile, content);
                    this.memoryService.create({
                        category: 'concept',
                        title: `${keyFile} Overview`,
                        content: summary,
                        tags: ['auto-generated', 'config', keyFile],
                        importance: 3,
                    });
                    results.push(`- Captured ${keyFile}`);
                }
            }
        }
        // Detect tech stack
        const techStack = this.detectTechStack();
        if (techStack.length > 0) {
            this.memoryService.create({
                category: 'concept',
                title: 'Technology Stack',
                content: `This project uses:\n${techStack.map(t => `- ${t}`).join('\n')}`,
                tags: ['auto-generated', 'tech-stack'],
                importance: 4,
            });
            results.push(`- Detected tech stack: ${techStack.join(', ')}`);
        }
        return results.join('\n');
    }
    isProjectInitialized() {
        const memories = this.memoryService.list({ limit: 1 });
        return memories.some(m => m.tags.includes('auto-generated'));
    }
    getDirectoryStructure(dir, depth, prefix = '') {
        if (depth === 0)
            return '';
        let result = '';
        try {
            const items = fs.readdirSync(dir);
            const filtered = items.filter(item => !IGNORE_DIRS.includes(item) && !item.startsWith('.'));
            for (let i = 0; i < filtered.length && i < 20; i++) {
                const item = filtered[i];
                const itemPath = path.join(dir, item);
                const isLast = i === filtered.length - 1 || i === 19;
                const connector = isLast ? '└── ' : '├── ';
                const stat = fs.statSync(itemPath);
                result += `${prefix}${connector}${item}${stat.isDirectory() ? '/' : ''}\n`;
                if (stat.isDirectory() && depth > 1) {
                    const newPrefix = prefix + (isLast ? '    ' : '│   ');
                    result += this.getDirectoryStructure(itemPath, depth - 1, newPrefix);
                }
            }
            if (filtered.length > 20) {
                result += `${prefix}└── ... (${filtered.length - 20} more items)\n`;
            }
        }
        catch {
            // Ignore permission errors
        }
        return result;
    }
    readFileSafe(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            // Limit to first 2000 chars
            return content.slice(0, 2000);
        }
        catch {
            return null;
        }
    }
    summarizeFile(filename, content) {
        if (filename === 'package.json') {
            try {
                const pkg = JSON.parse(content);
                const deps = Object.keys(pkg.dependencies || {}).slice(0, 10);
                const devDeps = Object.keys(pkg.devDependencies || {}).slice(0, 10);
                return `Name: ${pkg.name || 'unnamed'}
Version: ${pkg.version || 'n/a'}
Description: ${pkg.description || 'n/a'}
Main dependencies: ${deps.join(', ') || 'none'}
Dev dependencies: ${devDeps.join(', ') || 'none'}
Scripts: ${Object.keys(pkg.scripts || {}).join(', ') || 'none'}`;
            }
            catch {
                return content;
            }
        }
        if (filename === 'README.md') {
            // Get first 500 chars of README
            return content.slice(0, 500) + (content.length > 500 ? '...' : '');
        }
        return content.slice(0, 500) + (content.length > 500 ? '...' : '');
    }
    detectTechStack() {
        const stack = [];
        const checks = [
            ['package.json', 'Node.js/JavaScript'],
            ['tsconfig.json', 'TypeScript'],
            ['pyproject.toml', 'Python'],
            ['requirements.txt', 'Python'],
            ['Cargo.toml', 'Rust'],
            ['go.mod', 'Go'],
            ['Gemfile', 'Ruby'],
            ['pom.xml', 'Java/Maven'],
            ['build.gradle', 'Java/Gradle'],
            ['docker-compose.yml', 'Docker'],
            ['Dockerfile', 'Docker'],
            ['.github/workflows', 'GitHub Actions'],
        ];
        for (const [file, tech] of checks) {
            const filePath = path.join(this.projectPath, file);
            if (fs.existsSync(filePath)) {
                if (!stack.includes(tech)) {
                    stack.push(tech);
                }
            }
        }
        return stack;
    }
}
//# sourceMappingURL=scanner.js.map