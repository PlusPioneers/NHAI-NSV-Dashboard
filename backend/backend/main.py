from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from typing import List, Optional
import pandas as pd
import numpy as np
import io
import json
from utils import process_nhai_data, determine_severity, validate_coordinates

app = FastAPI(title="NHAI NSV Dashboard API", version="1.0.0")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global variable to store processed data
processed_data = []

@app.get("/")
async def root():
    return {"message": "NHAI NSV Dashboard API", "version": "1.0.0"}

@app.post("/upload")
async def upload_files(files: List[UploadFile] = File(...)):
    """
    Process uploaded CSV/Excel files and return processed pavement data
    """
    global processed_data
    processed_data = []
    
    try:
        for file in files:
            if file.filename.lower().endswith(('.csv', '.xlsx', '.xls')):
                content = await file.read()
                
                # Process based on file type
                if file.filename.lower().endswith('.csv'):
                    df = pd.read_csv(io.StringIO(content.decode('utf-8')), header=None)
                else:
                    df = pd.read_excel(io.BytesIO(content), header=None)
                
                # Process the data
                file_data = process_nhai_data(df)
                processed_data.extend(file_data)
            else:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Unsupported file format: {file.filename}"
                )
        
        # Generate statistics
        stats = calculate_statistics(processed_data)
        
        return {
            "success": True,
            "message": f"Successfully processed {len(files)} file(s)",
            "data": processed_data,
            "statistics": stats,
            "total_points": len(processed_data)
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing files: {str(e)}")

@app.get("/data")
async def get_data():
    """
    Get all processed pavement data
    """
    stats = calculate_statistics(processed_data)
    return {
        "data": processed_data,
        "statistics": stats,
        "total_points": len(processed_data)
    }

@app.get("/data/filter")
async def filter_data(
    severity: Optional[str] = None,
    measurement_type: Optional[str] = None,
    highway: Optional[str] = None
):
    """
    Filter pavement data by various criteria
    """
    filtered_data = processed_data.copy()
    
    if severity and severity.lower() != 'all':
        filtered_data = [d for d in filtered_data if d['severity'] == severity]
    
    if measurement_type and measurement_type.lower() != 'all':
        filtered_data = [d for d in filtered_data if d['type'] == measurement_type]
    
    if highway:
        filtered_data = [d for d in filtered_data if highway.lower() in d['highway'].lower()]
    
    stats = calculate_statistics(filtered_data)
    
    return {
        "data": filtered_data,
        "statistics": stats,
        "total_points": len(filtered_data),
        "filters_applied": {
            "severity": severity,
            "measurement_type": measurement_type,
            "highway": highway
        }
    }

@app.get("/statistics")
async def get_statistics():
    """
    Get statistics summary
    """
    return calculate_statistics(processed_data)

@app.delete("/data")
async def clear_data():
    """
    Clear all processed data
    """
    global processed_data
    processed_data = []
    return {"success": True, "message": "All data cleared successfully"}

@app.get("/export")
async def export_data():
    """
    Export processed data as CSV
    """
    if not processed_data:
        raise HTTPException(status_code=400, detail="No data to export")
    
    try:
        # Convert to DataFrame
        df = pd.DataFrame(processed_data)
        
        # Convert to CSV
        csv_buffer = io.StringIO()
        df.to_csv(csv_buffer, index=False)
        csv_content = csv_buffer.getvalue()
        
        return {
            "success": True,
            "csv_content": csv_content,
            "filename": f"nhai_pavement_data_{pd.Timestamp.now().strftime('%Y%m%d_%H%M%S')}.csv"
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error exporting data: {str(e)}")

@app.post("/sample-data")
async def load_sample_data():
    """
    Load sample data for demonstration
    """
    global processed_data
    
    # Generate sample data
    sample_data = generate_sample_data()
    processed_data = sample_data
    
    stats = calculate_statistics(processed_data)
    
    return {
        "success": True,
        "message": "Sample data loaded successfully",
        "data": processed_data,
        "statistics": stats,
        "total_points": len(processed_data)
    }

def calculate_statistics(data):
    """
    Calculate statistics for the data
    """
    if not data:
        return {
            "total": 0,
            "high": 0,
            "medium": 0,
            "low": 0,
            "by_type": {},
            "by_highway": {}
        }
    
    total = len(data)
    high = len([d for d in data if d['severity'] == 'High'])
    medium = len([d for d in data if d['severity'] == 'Medium'])
    low = len([d for d in data if d['severity'] == 'Low'])
    
    # Statistics by type
    by_type = {}
    for item in data:
        measurement_type = item['type']
        if measurement_type not in by_type:
            by_type[measurement_type] = {'total': 0, 'high': 0, 'medium': 0, 'low': 0}
        by_type[measurement_type]['total'] += 1
        by_type[measurement_type][item['severity'].lower()] += 1
    
    # Statistics by highway
    by_highway = {}
    for item in data:
        highway = item['highway']
        if highway not in by_highway:
            by_highway[highway] = {'total': 0, 'high': 0, 'medium': 0, 'low': 0}
        by_highway[highway]['total'] += 1
        by_highway[highway][item['severity'].lower()] += 1
    
    return {
        "total": total,
        "high": high,
        "medium": medium,
        "low": low,
        "by_type": by_type,
        "by_highway": by_highway
    }

def generate_sample_data():
    """
    Generate sample pavement data for demonstration
    """
    import random
    from datetime import datetime
    
    sample_data = []
    highways = ['NH-1', 'NH-2', 'NH-8', 'NH-44', 'NH-48']
    lanes = ['L1', 'L2', 'R1', 'R2']
    measurement_types = ['Roughness', 'Rutting', 'Cracking', 'Ravelling']
    
    # Generate random points across India
    for i in range(100):
        lat = random.uniform(8.0, 35.0)  # India latitude range
        lng = random.uniform(68.0, 97.0)  # India longitude range
        
        highway = random.choice(highways)
        lane = random.choice(lanes)
        measurement_type = random.choice(measurement_types)
        
        # Generate value based on measurement type
        if measurement_type == 'Roughness':
            value = random.uniform(800, 4000)
            limit = 2400
            unit = 'mm/km'
        elif measurement_type == 'Rutting':
            value = random.uniform(1, 15)
            limit = 5
            unit = 'mm'
        elif measurement_type == 'Cracking':
            value = random.uniform(0.5, 20)
            limit = 5
            unit = '% area'
        else:  # Ravelling
            value = random.uniform(0.1, 5)
            limit = 1
            unit = '% area'
        
        severity = determine_severity(measurement_type, value, limit)
        
        sample_data.append({
            'lat': lat,
            'lng': lng,
            'highway': highway,
            'lane': lane,
            'startChainage': f"{i * 100}",
            'endChainage': f"{(i + 1) * 100}",
            'structure': f"Structure {i + 1}",
            'type': measurement_type,
            'value': round(value, 2),
            'unit': unit,
            'severity': severity,
            'limit': limit,
            'datetime': datetime.now().isoformat()
        })
    
    return sample_data

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)