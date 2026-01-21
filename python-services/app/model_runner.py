import torch
import os
from models.hetero_gnn import ClimaAuditGNN
import joblib
from torch_geometric.data import Data
import pandas as pd
import numpy as np
from sklearn.preprocessing import OneHotEncoder

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MODEL_DIR = os.path.join(BASE_DIR, "models")


class GNNWrapper:
    def __init__(self, device="cpu"):
        self.device = device

        # Use absolute paths
        scaler_path = os.path.join(MODEL_DIR, "scaler.pkl")
        model_path = os.path.join(MODEL_DIR, "climate_audit_gnn.pt")

        print("Looking for model at:", model_path)
        print("Looking for scaler at:", scaler_path)

        # Load scaler
        self.scaler = joblib.load(scaler_path)

        # Create model architecture
        self.model = ClimaAuditGNN(num_features=2).to(self.device)

        # Load model weights
        self.model.load_state_dict(torch.load(model_path, map_location=self.device))
        self.model.eval()

        # Setup encoder for categorical columns
        self.cat_cols = ["wb_code"]  # Using wb_code as the country identifier
        self.encoder = OneHotEncoder(sparse_output=False, handle_unknown="ignore")

        # Get all possible categories from the training data
        nodes_path = os.path.join(BASE_DIR, "data", "nodes_final_physics.csv")
        if os.path.exists(nodes_path):
            train_nodes = pd.read_csv(nodes_path)
            self.encoder.fit(
                train_nodes[["wb_code"]]
            )  # Fit only once during initialization

    def _encode_features(self, df):
        """Extract and preprocess the two expected numerical features."""
        # Only use the two expected numerical features
        expected_numeric_cols = ["gdp_usd", "co2_emissions_kt"]

        # Ensure we only use columns that exist in the dataframe
        available_numeric_cols = [
            col for col in expected_numeric_cols if col in df.columns
        ]

        if len(available_numeric_cols) != 2:
            missing_cols = set(expected_numeric_cols) - set(available_numeric_cols)
            raise ValueError(
                f"Expected 2 numerical features, but found {len(available_numeric_cols)}. "
                f"Missing columns: {missing_cols}. "
                f"Available columns: {df.columns.tolist()}"
            )

        # Convert numeric columns to float
        try:
            numeric_data = df[available_numeric_cols].astype(float).values
            return numeric_data
        except Exception as e:
            print(f"Error processing numeric columns {available_numeric_cols}: {e}")
            print(
                f"Problematic values in data: {df[available_numeric_cols].loc[df[available_numeric_cols].isna().any(axis=1)]}"
            )
            raise

    def predict(self, df, edge_index):
        """
        df: pandas DataFrame of node features
        edge_index: edge list (2 x num_edges)
        """
        # Just call predict_anomaly_scores to avoid code duplication
        return self.predict_anomaly_scores(df, edge_index)

    # Main prediction method with detailed error handling and logging
    def predict_anomaly_scores(self, df, edge_index):
        """
        df: pandas DataFrame of node features
        edge_index: edge list (2 x num_edges)
        """

        print("\n===== DEBUG: Starting anomaly prediction =====")

        # 1. Check expected numeric columns
        expected_numeric_cols = ["gdp_usd", "co2_emissions_kt"]
        missing_numeric = [c for c in expected_numeric_cols if c not in df.columns]
        if missing_numeric:
            print(f"Missing numeric columns: {missing_numeric}")
        else:
            print(f"All expected numeric columns are present: {expected_numeric_cols}")

        # 2. Check categorical columns
        missing_cats = [c for c in self.cat_cols if c not in df.columns]
        if missing_cats:
            print(f" Missing categorical columns: {missing_cats}")
        else:
            print(f"All expected categorical columns are present: {self.cat_cols}")
            # Only print first few to keep logs clean
            if not df.empty:
                for col in self.cat_cols:
                    print(f"{col} unique values (first 10): {df[col].unique()[:10]}")

        # 3. Show numeric stats
        numeric_cols = [col for col in expected_numeric_cols if col in df.columns]
        if numeric_cols:
            print("\n--- Numeric column stats ---")
            print(df[numeric_cols].describe())

        # 4. Encode features
        try:
            features = self._encode_features(df)

            # === CRITICAL MATH FIX START ===
            # We must apply Log Transform because the model was trained on log-data.
            # This turns 17,000,000,000 into ~23.5
            print("\n--- Applying Log Transform (np.log1p) ---")
            features = np.log1p(features)
            # === CRITICAL MATH FIX END ===

            print("\n--- Features after encoding & log (first 10 rows) ---")
            print(features[:10])
        except Exception as e:
            print(f" Error during feature encoding: {e}")
            raise e

        # 5. Scale numeric features
        try:
            # Note: Features are already log-transformed now, so scaling will work correctly
            features = self.scaler.transform(features)
            print("\n--- Features after scaling (first 10 rows) ---")
            print(features[:10])
        except Exception as e:
            print(f" Error during scaling: {e}")
            raise e

        # Convert to tensor
        features_tensor = torch.tensor(features, dtype=torch.float32)

        # Handle edge_index
        if edge_index is None:
            num_nodes = len(df)
            edge_index = torch.combinations(
                torch.arange(num_nodes, device=self.device)
            ).t()
        else:
            edge_index = torch.tensor(edge_index, dtype=torch.long).to(self.device)

        # Create data object
        data = Data(x=features_tensor, edge_index=edge_index).to(self.device)

        # Make prediction
        with torch.no_grad():
            output = self.model(data)

        # Convert output to DataFrame
        result = pd.DataFrame(
            {
        "iso3": df["iso3"].values,
        "anomaly_score": output.cpu().numpy().flatten(),
            }
        )

        print(" Anomaly prediction completed.\n")
        return result
