importScripts('busytex_pipeline.js');

self.pipeline = null;

onmessage = async ({data : {files, main_tex_path, bibtex, busytex_wasm, busytex_js, preload_data_packages_js, data_packages_js, texmf_local, preload, verbose, driver, trim}}) =>
{
    // TODO: cache data packages from here? https://developer.mozilla.org/en-US/docs/Web/API/Cache

    if(busytex_wasm && busytex_js && preload_data_packages_js)
    {
        try
        {
            self.pipeline = new BusytexPipeline(busytex_js, busytex_wasm, data_packages_js, preload_data_packages_js, texmf_local, msg => postMessage({print : msg}), applet_versions => postMessage({ initialized : applet_versions }), preload, BusytexPipeline.ScriptLoaderWorker);
            if(trim)
            {
                // No bundled data package: format + config + texmf tree are supplied as input
                // files under project_dir. Redirect the hardcoded /texlive paths onto them.
                const PD = self.pipeline.project_dir;
                self.pipeline.fmt.pdftex   = PD + '/pdflatex.fmt';        // supplied format
                self.pipeline.env.TEXMFCNF = PD + '/texmf/texmf-dist/web2c'; // supplied texmf.cnf
                self.pipeline.env.TEXMFVAR = PD;                          // writable scratch
                // kpathsea needs argv0 (/bin/busytex) to exist to resolve SELFAUTO* paths.
                self.pipeline.Module.then(m => {
                    try { m.FS.mkdir('/bin'); } catch(_) {}
                    try { m.FS.writeFile('/bin/busytex', new Uint8Array([0])); } catch(_) {}
                    postMessage({print: 'TRIM /bin/busytex stub created\n'});
                });
                postMessage({print: 'TRIM env set, PD=' + PD + '\n'});
            }
            else
            {
                // Preloaded map is read-only; unlink then rewrite it WITH the cm-super TS1 entry
                // so \textbullet (tcrm1000) embeds sfrm1000.pfb instead of dying at mktexpk.
                self.pipeline.Module.then(m => {
                    const p = '/texlive/texmf-dist/texmf-var/fonts/map/pdftex/updmap/pdftex.map';
                    const line = 'tcrm1000 SFRM1000 " TS1Encoding ReEncodeFont " <cm-super-ts1.enc <sfrm1000.pfb';
                    try {
                        let cur = ''; try { cur = m.FS.readFile(p, {encoding:'utf8'}); } catch(_) {}
                        const body = cur.split('\n').filter(l => !l.startsWith('tcrm1000 ')).concat([line]).join('\n');
                        try { m.FS.unlink(p); } catch(_) {}
                        m.FS.writeFile(p, body);
                        postMessage({print: 'MAPPATCH ok len=' + body.length + '\n'});
                    } catch(e) { postMessage({print: 'MAPPATCH failed: ' + e + '\n'}); }
                });
            }
        }
        catch(err)
        {
            postMessage({exception: 'Exception during initialization: ' + err.toString() + '\nStack:\n' + err.stack});
        }
    }
    else if(files && self.pipeline)
    {
        try
        {
            postMessage(await self.pipeline.compile(files, main_tex_path, bibtex, verbose, driver, data_packages_js))
        }
        catch(err)
        {
            postMessage({exception: 'Exception during compilation: ' + err.toString() + '\nStack:\n' + err.stack});
        }
    }
};
