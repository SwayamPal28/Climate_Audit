import torch
import torch.nn.functional as F
from torch_geometric.nn import GCNConv
import torch.nn as nn


class ClimaAuditGNN(nn.Module):
    def __init__(self, num_features):
        super().__init__()
        # Layer 1: Local trade partners
        self.conv1 = GCNConv(num_features, 16)
        # Layer 2: Global context
        self.conv2 = GCNConv(16, 1)  # Output = Emission Score

    def forward(self, data):
        x, edge_index = data.x, data.edge_index

        # Pass 1
        x = self.conv1(x, edge_index)
        x = F.relu(x)
        x = F.dropout(x, training=self.training)

        # Pass 2
        x = self.conv2(x, edge_index)

        return x
