import torch
from torch_geometric.nn import HeteroConv, GATv2Conv, Linear
import torch.nn.functional as F

class ClimaAuditGNN(torch.nn.Module):
    def __init__(self, hidden_dim, out_dim, metadata):
        super().__init__()
        self.conv1 = HeteroConv({
            edge_type: GATv2Conv(-1, hidden_dim, heads=2, add_self_loops=False)
            for edge_type in metadata[1]
        }, aggr='sum')
        self.conv2 = HeteroConv({
            edge_type: GATv2Conv(hidden_dim * 2, hidden_dim, heads=1, add_self_loops=False)
            for edge_type in metadata[1]
        }, aggr='sum')
        self.lin = Linear(hidden_dim, out_dim)

    def forward(self, x_dict, edge_index_dict):
        x_dict = self.conv1(x_dict, edge_index_dict)
        x_dict = {key: F.relu(x) for key, x in x_dict.items()}
        x_dict = self.conv2(x_dict, edge_index_dict)
        x_dict = {key: F.relu(x) for key, x in x_dict.items()}
        return self.lin(x_dict['country'])