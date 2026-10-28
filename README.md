# Gestão de Alunos

Site para o coordenador registar e pesquisar alunos (nome, classe, turma, sala, telefone do encarregado e ocorrências).
Os dados ficam num ficheiro de texto, `bd/alunos.txt`. O servidor é em Python e não precisa de instalar nada além do próprio Python 3.9 ou mais recente.

## Como correr (Windows)

1. Abre a pasta do projecto, clica na barra de endereço, escreve `cmd` e carrega em Enter.
2. Escreve:

   ```
   python src\servidor.py
   ```

   (Se `python` não funcionar, tenta `py -3 src\servidor.py`.)
3. O site abre sozinho no browser, em `http://localhost:8000`. Para parar, carrega em Ctrl+C ou fecha a janela.

Em alternativa, dá dois cliques em `iniciar.bat`.

Na primeira vez o site pede para criar o **código do coordenador**. Esse código protege os dados e é pedido sempre que se entra.

Linux e Mac: `python3 src/servidor.py`.

Outra porta: `set ALUNOS_PORTA=8001` (Windows) ou `ALUNOS_PORTA=8001 python3 src/servidor.py` (Linux/Mac) antes de arrancar.

## Estrutura

```
bd/          alunos.txt, coordenador.txt e copias/ (criados sozinhos; não vão para o Git)
public/      o site: HTML, css/, js/ e fonts/
src/         o servidor: ficheiro_alunos.py, registar.py, pesquisar.py, servidor.py ...
tests/       testes automáticos
```

## Dados e cópias de segurança

- Cada alteração é gravada de forma segura: se algo falhar a meio, o ficheiro antigo fica como estava.
- Antes de alterar, o servidor guarda cópias em `bd/copias/` (as últimas 50). Para recuperar, copia uma delas por cima de `bd/alunos.txt` com o servidor parado.
- Formato de cada linha de `alunos.txt`: `id;nome;sala;classe;turma;encarregado;ocorrencia`

## Testes

```
python -m unittest discover -s tests
```
