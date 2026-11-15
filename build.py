# Regenera ASTRAVITA.html a partir de los módulos en src/  ->  python3 build.py
import pathlib
W = pathlib.Path(__file__).resolve().parent
S = W / 'src'
order = ['core', 'store', 'auth', 'signal', 'live', 'engine', 'charts', 'data', 'demo', 'ui', 'views-shared', 'views-public', 'views-patient', 'views-doctor', 'main']
js = '\n'.join((S / 'js' / f'{n}.js').read_text(encoding='utf-8') for n in order)
kb = (S / 'kb.json').read_text(encoding='utf-8').replace('</', '<\\/')
t = (S / 'template.html').read_text(encoding='utf-8')
out = (t.replace('{{CSS}}', (S / 'styles.css').read_text(encoding='utf-8'))
        .replace('{{FAV}}', (S / 'fav.b64').read_text().strip())
        .replace('{{LOGO}}', (S / 'logo.b64').read_text().strip())
        .replace('{{KB}}', kb).replace('{{JS}}', js))
(W / 'ASTRAVITA.html').write_text(out, encoding='utf-8')
print('ASTRAVITA.html', len(out.encode()), 'bytes')
