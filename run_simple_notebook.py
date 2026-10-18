"""Build and execute the English notebook from its percent-cell Python source."""
from pathlib import Path
import re
import io
import traceback
import nbformat
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from IPython.core.interactiveshell import InteractiveShell
from IPython.utils.capture import capture_output
from IPython.display import Image, display

root = Path(__file__).resolve().parent
source = (root / "car_price_analysis_simple.py").read_text(encoding="utf-8")
parts = re.split(r"(?m)^# %%([^\n]*)\n", source)
cells = []
for index in range(1, len(parts), 2):
    kind, body = parts[index], parts[index + 1].strip()
    if "[markdown]" in kind:
        body = "\n".join(
            line[2:] if line.startswith("# ") else "" if line == "#" else line
            for line in body.splitlines()
        )
        cells.append(nbformat.v4.new_markdown_cell(body))
    else:
        cells.append(nbformat.v4.new_code_cell(body))

notebook = nbformat.v4.new_notebook(cells=cells)
notebook.metadata.kernelspec = {
    "display_name": "Python 3 (ipykernel)", "language": "python", "name": "python3"
}
path = root / "car-price-analysis-simple.ipynb"
nbformat.write(notebook, path)
print(f"Created notebook with {len(cells)} cells.", flush=True)

figure_count = 0

def capture_show(*args, **kwargs):
    global figure_count
    for number in plt.get_fignums():
        figure = plt.figure(number)
        buffer = io.BytesIO()
        figure.savefig(buffer, format="png", bbox_inches="tight", dpi=110)
        figure_count += 1
        output_dir = root / "outputs_car_price_simple"
        output_dir.mkdir(exist_ok=True)
        (output_dir / f"figure_{figure_count}.png").write_bytes(buffer.getvalue())
        display(Image(data=buffer.getvalue()))
        plt.close(figure)

plt.show = capture_show
shell = InteractiveShell.instance()
for index, cell in enumerate(notebook.cells):
    if cell.cell_type != "code":
        continue
    print(f"Running cell {index + 1}/{len(cells)}", flush=True)
    with capture_output(stdout=True, stderr=True, display=True) as captured:
        result = shell.run_cell(cell.source, store_history=True)
    cell.execution_count = shell.execution_count - 1
    cell.outputs = []
    if captured.stdout:
        cell.outputs.append(nbformat.v4.new_output("stream", name="stdout", text=captured.stdout))
    if captured.stderr:
        cell.outputs.append(nbformat.v4.new_output("stream", name="stderr", text=captured.stderr))
    for output in captured.outputs:
        cell.outputs.append(nbformat.v4.new_output(
            "display_data", data=output.data, metadata=output.metadata
        ))
    error = result.error_before_exec or result.error_in_exec
    if error:
        cell.outputs.append(nbformat.v4.new_output(
            "error", ename=type(error).__name__, evalue=str(error),
            traceback=traceback.format_exception(error),
        ))
    nbformat.write(notebook, path)
    if error:
        raise error

nbformat.validate(notebook)
print("All notebook cells completed successfully.", flush=True)
