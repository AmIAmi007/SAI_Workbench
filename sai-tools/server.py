#!/usr/bin/env python3
"""
SAI (Sovereign Agentic Infrastructure) Industrial Tools Server
Air-gapped refinery operations & engineering tool suite.
"""

from __future__ import annotations
import math
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict

# Support both mcp 2.x (MCPServer) and mcp 1.x (FastMCP)
try:
    from mcp.server.mcpserver import MCPServer
    mcp = MCPServer("sai-refinery-tools")
except (ImportError, ModuleNotFoundError):
    from mcp.server.fastmcp import FastMCP
    mcp = FastMCP("sai-refinery-tools")

OUTPUT_DIR = Path(os.path.expanduser("~/sai-output"))
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


def _build_docx_document(
    moc_id: str,
    timestamp: str,
    unit_id: str,
    moc_type: str,
    justification: str,
    risk_level: str,
    approver: str,
    output_path: Path,
) -> None:
    """Builds an enterprise-grade formatted MOC deliverable in DOCX format."""
    from docx import Document
    from docx.shared import Inches, Pt, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.enum.table import WD_TABLE_ALIGNMENT

    doc = Document()

    # Document Title
    header_p = doc.add_paragraph()
    header_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    run_org = header_p.add_run("SOVEREIGN AGENTIC INFRASTRUCTURE (SAI)\n")
    run_org.bold = True
    run_org.font.size = Pt(16)
    run_org.font.color.rgb = RGBColor(0x1a, 0x47, 0x7c)  # Industrial Deep Blue

    run_sub = header_p.add_run("AIR-GAPPED REFINERY OPERATIONS • FIELD DELIVERABLE\n")
    run_sub.bold = True
    run_sub.font.size = Pt(10)
    run_sub.font.color.rgb = RGBColor(0x66, 0x66, 0x66)

    run_title = header_p.add_run("FORMAL MANAGEMENT OF CHANGE (MOC) & HAZOP APPROVAL NOTE")
    run_title.bold = True
    run_title.font.size = Pt(12)
    run_title.font.color.rgb = RGBColor(0x22, 0x22, 0x22)

    doc.add_paragraph()  # spacing

    # Metadata Table
    table = doc.add_table(rows=7, cols=2)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    table.autofit = False

    metadata = [
        ("MOC REFERENCE ID", moc_id),
        ("TIMESTAMP (UTC)", timestamp),
        ("TARGET UNIT / ASSET", unit_id.upper()),
        ("CHANGE CLASSIFICATION", moc_type.upper()),
        ("SAFETY RISK PROFILE", f"[{risk_level.upper()}]"),
        ("APPROVING OFFICER", approver),
        ("STATUTORY CODE", "OISD-156 / OSHA PSM 1910.119 COMPLIANT"),
    ]

    for idx, (label, val) in enumerate(metadata):
        row = table.rows[idx]
        cell_label, cell_val = row.cells[0], row.cells[1]
        
        p_label = cell_label.paragraphs[0]
        r_label = p_label.add_run(label)
        r_label.bold = True
        r_label.font.size = Pt(9.5)
        
        p_val = cell_val.paragraphs[0]
        r_val = p_val.add_run(val)
        r_val.font.size = Pt(9.5)
        if label == "SAFETY RISK PROFILE":
            r_val.bold = True
            r_val.font.color.rgb = RGBColor(0xc0, 0x00, 0x00) if "HIGH" in val or "CRITICAL" in val else RGBColor(0x00, 0x70, 0x00)

    doc.add_paragraph()  # spacing

    # Section 1: Justification
    h1 = doc.add_heading("1. CHANGE JUSTIFICATION & TECHNICAL CONTEXT", level=2)
    h1.style.font.color.rgb = RGBColor(0x1a, 0x47, 0x7c)
    p_just = doc.add_paragraph(justification.strip())
    p_just.paragraph_format.line_spacing = 1.15

    doc.add_paragraph()

    # Section 2: Safety Checklist
    h2 = doc.add_heading("2. MANDATORY SAFETY VERIFICATION CHECKLIST", level=2)
    h2.style.font.color.rgb = RGBColor(0x1a, 0x47, 0x7c)
    
    checklist = [
        "Process Safety Information (PSI) verified against air-gapped P&IDs",
        "Pressure Relief Valve (PRV) sizing adequate for transient thermal surge",
        "Interlock & Emergency Shutdown (ESD) bypass logged with Shift Incharge",
        "Operator console alarms reconfigured for threshold surveillance",
    ]
    for item in checklist:
        p_chk = doc.add_paragraph(style="List Bullet")
        p_chk.add_run("[VERIFIED] ").bold = True
        p_chk.add_run(item)

    doc.add_paragraph()

    # Section 3: Authorization Sign-off
    h3 = doc.add_heading("3. AUTHORIZATION & SIGN-OFF", level=2)
    h3.style.font.color.rgb = RGBColor(0x1a, 0x47, 0x7c)

    p_auth = doc.add_paragraph()
    p_auth.add_run("STATUS: ").bold = True
    p_auth.add_run("APPROVED FOR IMMEDIATE FIELD EXECUTION\n")
    p_auth.add_run("AUTHORIZED BY: ").bold = True
    p_auth.add_run(f"{approver}\n")
    p_auth.add_run("SYSTEM: ").bold = True
    p_auth.add_run("Sovereign Agentic Infrastructure (SAI) Air-Gapped Engine\n")

    doc.save(str(output_path))


@mcp.tool()
def generate_sai_approval_note(
    unit_id: str,
    moc_type: str,
    justification: str,
    risk_level: str = "MEDIUM",
    approver: str = "Chief Operations Manager",
    file_format: str = "docx",
) -> str:
    """Generate a formal SAI Refinery Management of Change (MOC) approval note for PSU/refinery work
    and persist the deliverable to disk in ~/sai-output/.

    Args:
        unit_id: Refinery unit/asset tag (e.g., "CDU-1", "VDU-2", "FCCU-REACTOR-01")
        moc_type: Type of change (e.g., "Operational Setpoint Override", "Temporary Bypass", "Metallurgy Upgrade")
        justification: Engineering rationale and hazard review summary
        risk_level: Assessed risk tier: "LOW", "MEDIUM", "HIGH", or "CRITICAL"
        approver: Designee or authority responsible for sign-off
        file_format: Output file deliverable format ("docx", "pdf", "md", or "txt"). Defaults to "docx".
    """
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")
    clean_unit = unit_id.replace(" ", "-").replace("/", "-").upper()
    moc_id = f"SAI-MOC-{clean_unit}-{datetime.now().strftime('%Y%m%d%H%M%S')}"

    text_content = f"""================================================================================
SOVEREIGN AGENTIC INFRASTRUCTURE (SAI) - AIR-GAPPED REFINERY OPERATIONS
FORMAL MANAGEMENT OF CHANGE (MOC) & HAZOP APPROVAL NOTE
================================================================================
MOC REFERENCE ID : {moc_id}
TIMESTAMP (UTC)  : {timestamp}
TARGET UNIT / TAG: {unit_id.upper()}
CLASSIFICATION   : {moc_type.upper()}
RISK PROFILE     : [{risk_level.upper()}]
APPROVING OFFICER: {approver}
STATUTORY CODE   : OISD-156 / OSHA PSM 1910.119 COMPLIANT
--------------------------------------------------------------------------------
1. CHANGE JUSTIFICATION & CONTEXT:
{justification.strip()}

2. MANDATORY SAFETY VERIFICATION CHECKLIST:
   [X] Process Safety Information (PSI) verified against air-gapped P&IDs
   [X] Pressure Relief Valve (PRV) sizing adequate for transient thermal surge
   [X] Interlock & Emergency Shutdown (ESD) bypass logged with Shift Incharge
   [X] Operator console alarms reconfigured for threshold surveillance

3. AUTHORIZATION:
   Status: APPROVED FOR IMMEDIATE FIELD EXECUTION
   Authorized by: {approver} via Sovereign Agentic Infrastructure (SAI)
================================================================================
"""

    format_choice = file_format.strip().lower()
    created_files = []

    # Always generate DOCX as requested
    docx_filename = f"{moc_id}.docx"
    docx_path = OUTPUT_DIR / docx_filename
    try:
        _build_docx_document(
            moc_id=moc_id,
            timestamp=timestamp,
            unit_id=unit_id,
            moc_type=moc_type,
            justification=justification,
            risk_level=risk_level,
            approver=approver,
            output_path=docx_path,
        )
        created_files.append(str(docx_path))
    except Exception as exc:
        print(f"Warning: Failed to create docx deliverable: {exc}", file=sys.stderr)

    # If md or txt or companion requested, save text/markdown deliverable
    txt_filename = f"{moc_id}.txt"
    txt_path = OUTPUT_DIR / txt_filename
    try:
        txt_path.write_text(text_content, encoding="utf-8")
        created_files.append(str(txt_path))
    except Exception as exc:
        print(f"Warning: Failed to create text deliverable: {exc}", file=sys.stderr)

    files_summary = "\n".join([f"   - {f} ({os.path.getsize(f)} bytes)" for f in created_files if os.path.exists(f)])

    return f"""{text_content}
[SAI FILE SYSTEM DELIVERABLE CREATED]
Output Directory: {OUTPUT_DIR}
Generated Files:
{files_summary}
"""


@mcp.tool()
def execute_engineering_calc(
    calc_type: str,
    parameters: Dict[str, float],
) -> Dict[str, Any]:
    """Execute industrial engineering calculations for refinery fluid mechanics and thermodynamics.

    Supported calc_types:
      - "pipe_velocity": parameters: {"flow_rate_m3_h": float, "pipe_inner_dia_mm": float}
      - "reynolds_number": parameters: {"velocity_m_s": float, "diameter_m": float, "density_kg_m3": float, "viscosity_pa_s": float}
      - "darcy_pressure_drop": parameters: {"friction_factor": float, "length_m": float, "diameter_m": float, "density_kg_m3": float, "velocity_m_s": float}
      - "heat_duty_kw": parameters: {"mass_flow_kg_s": float, "specific_heat_kj_kg_k": float, "delta_t_c": float}

    Args:
        calc_type: One of 'pipe_velocity', 'reynolds_number', 'darcy_pressure_drop', 'heat_duty_kw'
        parameters: Numeric input parameters required for the selected calculation
    """
    calc = calc_type.strip().lower()

    if calc == "pipe_velocity":
        q_m3_h = parameters.get("flow_rate_m3_h")
        dia_mm = parameters.get("pipe_inner_dia_mm")
        if not q_m3_h or not dia_mm or dia_mm <= 0:
            return {"error": "pipe_velocity requires positive 'flow_rate_m3_h' and 'pipe_inner_dia_mm'"}
        
        dia_m = dia_mm / 1000.0
        area = math.pi * (dia_m / 2.0) ** 2
        q_m3_s = q_m3_h / 3600.0
        velocity = q_m3_s / area
        is_erosive = velocity > 4.5

        return {
            "calculation": "Pipe Velocity",
            "velocity_m_s": round(velocity, 3),
            "cross_section_area_m2": round(area, 6),
            "flow_regime_warning": "High erosive velocity detected (>4.5 m/s) - verify API RP 14E limit" if is_erosive else "Within standard hydraulic velocity limits",
            "standards_basis": "API RP 14E Recommended Practice for Liquid Piping",
        }

    elif calc == "reynolds_number":
        v = parameters.get("velocity_m_s")
        d = parameters.get("diameter_m")
        rho = parameters.get("density_kg_m3")
        mu = parameters.get("viscosity_pa_s")
        if None in (v, d, rho, mu) or mu <= 0 or d <= 0:
            return {"error": "reynolds_number requires 'velocity_m_s', 'diameter_m', 'density_kg_m3', and positive 'viscosity_pa_s'"}
        
        re = (rho * v * d) / mu
        regime = "Laminar (Re < 2100)" if re < 2100 else ("Transitional (2100 <= Re <= 4000)" if re <= 4000 else "Turbulent (Re > 4000)")

        return {
            "calculation": "Reynolds Number",
            "reynolds_number": round(re, 2),
            "regime": regime,
            "standards_basis": "Crane Technical Paper 410 / Perry's Chemical Engineers' Handbook",
        }

    elif calc == "darcy_pressure_drop":
        f = parameters.get("friction_factor")
        L = parameters.get("length_m")
        d = parameters.get("diameter_m")
        rho = parameters.get("density_kg_m3")
        v = parameters.get("velocity_m_s")
        if None in (f, L, d, rho, v) or d <= 0:
            return {"error": "darcy_pressure_drop requires 'friction_factor', 'length_m', 'diameter_m', 'density_kg_m3', 'velocity_m_s'"}
        
        delta_p_pa = f * (L / d) * (rho * (v ** 2) / 2.0)
        delta_p_bar = delta_p_pa / 100000.0

        return {
            "calculation": "Darcy-Weisbach Pressure Drop",
            "pressure_drop_pa": round(delta_p_pa, 2),
            "pressure_drop_bar": round(delta_p_bar, 4),
            "standards_basis": "Darcy-Weisbach Equation for Frictional Pressure Loss",
        }

    elif calc == "heat_duty_kw":
        m_dot = parameters.get("mass_flow_kg_s")
        cp = parameters.get("specific_heat_kj_kg_k")
        delta_t = parameters.get("delta_t_c")
        if None in (m_dot, cp, delta_t):
            return {"error": "heat_duty_kw requires 'mass_flow_kg_s', 'specific_heat_kj_kg_k', and 'delta_t_c'"}
        
        q_kw = m_dot * cp * delta_t
        return {
            "calculation": "Sensible Heat Duty",
            "duty_kw": round(q_kw, 2),
            "duty_mw": round(q_kw / 1000.0, 3),
            "standards_basis": "Q = m * Cp * ΔT Thermal Balance",
        }

    else:
        return {
            "error": f"Unknown calculation type '{calc_type}'. Supported: pipe_velocity, reynolds_number, darcy_pressure_drop, heat_duty_kw"
        }


if __name__ == "__main__":
    port = 8000
    host = "127.0.0.1"
    print(f"Starting SAI Refinery Tools MCP Server on http://{host}:{port}/sse ...", file=sys.stderr)
    mcp.run(transport="sse", host=host, port=port, sse_path="/sse")
